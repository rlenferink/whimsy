# encoding: utf-8
# frozen_string_literal: true

require 'spec_helper'
require 'whimsy/asf'

describe ASF::Committee do
  describe "ASF::Committee::site" do
    it "should return string for 'httpd'" do
      res = ASF::Committee.find('HTTP Server').site
      expect(res).to match(%r{https?://httpd\.apache\.org/?}) 
    end

    it "should return nil for 'z-z-z'" do
      res = ASF::Committee.find('z-z-z').site
      expect(res.class).to eq(NilClass) 
    end
  end

  describe "ASF::Committee::description" do
    it "should return string for 'httpd'" do
      res = ASF::Committee.find('HTTP Server').description
      expect(res).to match(%r{Apache Web Server}) 
    end
    it "should return nil for 'z-z-z'" do
      res = ASF::Committee.find('z-z-z').description
      expect(res.class).to eq(NilClass) 
    end
  end

  describe "ASF::Committee.metadata" do
    it "should return hash for 'httpd'" do
      res = ASF::Committee.metadata('httpd')
      expect(res.class).to eq(Hash) 
      expect(res[:site]).to match(%r{https?://httpd\.apache\.org/?}) 
    end

    it "should return nil for 'z-z-z'" do
      res = ASF::Committee.metadata('z-z-z')
      expect(res.class).to eq(NilClass) 
    end

    it "should return hash for 'httpd Committee'" do
      cttee = ASF::Committee.find('HTTP Server')
      res = ASF::Committee.metadata(cttee)
      expect(res.class).to eq(Hash) 
      expect(res[:site]).to match(%r{https?://httpd\.apache\.org/?})
    end

    it "should return hash for 'comdev'" do
      res = ASF::Committee.metadata('comdev')
      expect(res.class).to eq(Hash) 
      expect(res[:site]).to match(%r{https?://community\.apache\.org/?}) 
    end

  end

  describe "ASF::Committee.appendtlpmetadata" do
    board = ASF::SVN.find('board')
    file = File.join(board, 'committee-info.yaml')
    input = File.read(file)
    it "should fail for 'httpd'" do
      res = nil
      # Wunderbar.logger = nil; is needed to ensure logging output works as expected
      expect { Wunderbar.logger = nil; res = ASF::Committee.appendtlpmetadata(input,'httpd','description') }.to output("_WARN Entry for 'httpd' already exists under :tlps\n").to_stderr
      expect(res).to equal(input)
    end    

    it "should fail for 'comdev'" do
      res = nil
      # Wunderbar.logger = nil; is needed to ensure logging output works as expected
      expect { Wunderbar.logger = nil; res = ASF::Committee.appendtlpmetadata(input,'comdev','description') }.to output("_WARN Entry for 'comdev' already exists under :cttees\n").to_stderr
      expect(res).to equal(input)
    end    
    
    pmc = 'a-b-c'
    it "should succeed for '#{pmc}'" do
      res = nil
      desc = 'Description of A-B-C'
      expect { res = ASF::Committee.appendtlpmetadata(input,pmc,desc) }.to output("").to_stderr
      expect(res).not_to eq(input)
      tlps = YAML.load(res)[:tlps]
      abc = tlps[pmc]
      expect(abc.class).to eq(Hash) 
      expect(abc[:site]).to match(%r{https?://#{pmc}\.apache\.org/?}) 
      expect(abc[:description]).to eq(desc) 
    end    
  end

end