#!/usr/bin/ruby

module Angular::AsfRosterServices

  # Since Angular.JS doesn't allow circular dependencies, keep the canonical
  # rosters of each class in a separate place so that they can be referenced
  # anywhere.
  class Roster
    COMMITTERS = {}
    PMCS = {}
    GROUPS = {}
    MEMBERS = []
  end

  ####################################################################
  #                          Model Objects                           #
  ####################################################################

  # Instances of this class represent a Committer from LDAP.
  class Committer
    @@list = Roster::COMMITTERS

    def self.load(ldap)
      angular.copy({}, @@list)
      for uid in ldap.committers
        @@list[uid] = Committer.new(ldap.committers[uid])
      end
    end

    def self.find(id)
      return @@list[id]
    end

    def initialize(ldap)
      angular.copy ldap, self
    end

    def link
      "committer/#{self.cn}"
    end

    def emails
      (self['asf-altEmail'] || []).concat(self.mail).uniq()
    end

    def pmcs
      result = []
      for name in Roster::PMCS
        pmc = Roster::PMCS[name]
        result << pmc if pmc.memberUid.include? self.uid 
      end
      result
    end

    def committer_on
      result = []
      for name in Roster::PMCS
        pmc = Roster::PMCS[name]
        next if not pmc.group or pmc.memberUid.include? self.uid 
        result << pmc if pmc.group.memberUid.include? self.uid 
      end
      result
    end

    def groups
      result = []
      for name in Roster::GROUPS
        group = Roster::GROUPS[name]
        result << group if group.memberUid.include? self.uid 
      end
      result
    end

    def chairs
      result = []
      for name in Roster::PMCS
        pmc = Roster::PMCS[name]
        result << pmc if pmc.chair == self 
      end
      result
    end

    def members_text
      Member.find(self.uid)
    end
  end

  # Instances of this class represent a PMC from LDAP, augmented with
  # information from committee-info.txt.
  class PMC
    @@list = Roster::PMCS

    def self.load(ldap)
      for pmc in ldap.pmcs
        @@list[pmc] = PMC.new(ldap.pmcs[pmc])
        @@list[pmc].group = ldap.groups[pmc]
      end
    end

    def initialize(ldap)
      angular.copy ldap, self
      @members = []
      @committers = []
      @@list[self.cn] = self
      @maillists = []
    end

    def display_name
      info = INFO.get(self.cn)
      info ? info.display_name : self.cn
    end

    def link
      "committee/#{self.cn}"
    end

    def chair
      info = INFO.get(self.cn)
      Committer.find(info.chair) if info
    end

    def members
      @members.clear()
      info = INFO.get(self.cn)

      # add PMC members from committee-info.txt
      if info
        info.memberUid.each do |uid|
          person = Committer.find(uid)
          @members << person if person
        end
      end

      # add unique PMC members from LDAP
      self.memberUid.each do |uid|
        person = Committer.find(uid)
        @members << person if person and not @members.include? person
      end

      @members
    end

    def committers
      self.members if @members.empty?
      members = @members
      @committers.clear()

      # add members from LDAP group of the same name
      if self.group
        self.group.memberUid.each do |uid|
          person = Committer.find(uid)
          @committers << person if person and not members.include? person
        end
      end

      @committers
    end

    def maillists(user)
      if @maillists.empty?
        prefix = "#{self.cn}-"
        for list in Mail.lists
          if list.start_with? prefix
            if Mail.lists[list] == 'public'
              @maillists << {name: list, link:
                "http://mail-archives.apache.org/mod_mbox/#{list}/"}
            elsif self.memberUid.include? user
              @maillists << {name: list, link:
                "https://mail-search.apache.org/pmc/private-arch/#{list}/"}
            elsif Roster::MEMBERS.include? user
              @maillists << {name: list, link:
                "https://mail-search.apache.org/members/private-arch/#{list}/"}
            end
          end
        end
      end
      return @maillists
    end
  end

  # Instances of this class represent non-PMC groups from various sources:
  # groups in LDAP with no corresponding PMC; groups in committee-info.txt
  # also with no corresponding LDAP PMC.
  class Group
    @@list = Roster::GROUPS

    def self.load(sources)
      if sources.ldap
        ldap = sources.ldap

        # start with any LDAP groups which aren't associated with a PMC
        for group in ldap.groups
          next if %w(committers).include? group or ldap.pmcs[group]
          @@list[group] = Group.new(ldap.groups[group], 'LDAP group')
        end

        # add in the LDAP services
        for group in ldap.services
          next if %w(apldap infrastructure-root).include? group
          if group == 'infrastructure' and @@list[group]
            @@list[group].group =
              Group.new(ldap.services[group], 'LDAP service')
          else
            @@list[group] = Group.new(ldap.services[group], 'LDAP service')
          end
        end

        # remove any groups previously loaded that are associated with PMCS
        for group in ldap.pmcs
          @@list.delete group
        end
      end

      if sources.info
        pmcs = Roster::PMCS
        info = sources.info
        for group in info
          next if pmcs[group] or info[group].memberUid.empty?
          @@list[group] = Group.new(info[group], 'committee-info.txt')
        end
      end

      if sources.auth
        info = sources.auth
        for group in info
          value = {cn: group, memberUid: info[group]}
          @@list[group] ||= Group.new(value, 'auth')
        end
      end
    end

    def initialize(ldap, source)
      angular.copy ldap, self
      self.source = source if source
      self.display_name ||= self.cn
      @members = []
    end

    def members
      @members.clear()

      self.memberUid.each do |uid|
        person = Committer.find(uid)
        @members << person
      end

      @members
    end

    def link
      "group/#{self.cn}"
    end
  end

  ####################################################################
  #                           Data Sources                           #
  ####################################################################

  class LDAP
    @@fetching = false

    def self.fetch_twice(url, &update)
      if_cached = {"Cache-Control" => "only-if-cached"}
      $http.get(url, cache: false, headers: if_cached).success { |result|
        update(result)
      }.finally {
        setTimeout 0 do
          $http.get(url, cache: false).success do |result, status|
            update(result) unless status == 304
          end
        end
      }
    end

    def self.get()
      unless @@fetching
        @@fetching = true
        self.fetch_twice 'json/ldap' do |result|
          Committer.load(result)
          PMC.load(result)
          Group.load(ldap: result)

          # extract members
          angular.copy result.groups.member.memberUid, Roster::MEMBERS
        end
      end

      return @@index
    end
  end

  class INFO
    @@info = {}

    def self.get(name)
      unless @@fetched and (@@fetched-Date.new().getTime()) < 300_000
        @@fetched = Date.new().getTime()
        $http.get('json/info').success do |result|
          for pmc in result
            result[pmc].cn = pmc
          end

          angular.copy result, @@info
          Group.load(info: @@info)
        end
      end

      if name
        return @@info[name]
      else
        return @@info
      end
    end
  end

  class AUTH
    def self.get()
      unless @@fetched and (@@fetched-Date.new().getTime()) < 300_000
        @@fetched = Date.new().getTime()
        $http.get('json/auth').success do |result|
          Group.load auth: result
        end
      end
    end
  end

  class Mail
    @@list = {}

    def self.lists
      unless @@fetched and (@@fetched-Date.new().getTime()) < 300_000
        @@fetched = Date.new().getTime()
        $http.get('json/mail').success do |result|
          angular.copy result, @@list
        end
      end

      @@list
    end
  end

  class Member
    @@list = {}

    def self.lists
      unless @@fetched and (@@fetched-Date.new().getTime()) < 300_000
        @@fetched = Date.new().getTime()
        $http.get('json/members').success do |result|
          angular.copy result, @@list
        end
      end

      @@list
    end

    def self.find(uid)
      return self.lists[uid]
    end
  end
end
