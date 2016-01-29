#
# Monitor status of public json directory
#

def Monitor.public_json(previous_status)
  logs = File.expand_path('../../www/logs/public-*')

  status = {}

  Dir[logs].each do |log|
    begin
      name = File.basename(log).sub('public-', '')

      status[name] = {
        href: "../logs/#{File.basename(log)}",
        mtime: File.mtime(log)
      }

      contents = File.read(log, encoding: Encoding::UTF_8)

      # Ignore Wunderbar logging for normal messages (TODO ignore _WARN ?)
      contents.sub! /^(_INFO|_DEBUG) .*\n+/, ''

      # diff -u output:
      if contents.sub! /^--- .*?\n(\n|\Z)/m, ''
        status[name].merge! level: 'info', title: 'updated'
      end

      unless contents.empty?
        status[name].merge! level: 'danger', data: contents.split("\n")
      end
    rescue Exception => e
      status[name] = {
        level: 'danger',
        data: {
          exception: {
            level: 'danger',
            text: e.inspect,
            data: e.backtrace
          }
        }
      }
    end
  end

  {data: status}
end
