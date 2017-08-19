#
# forward travis notifications to notifications@whimsical.
#
# 'To' header will be replaced
# 'From' header will effectively be replaced
# Transport headers names will be prepended with 'X-'
# Original content headers will be dropped (and recreated).
#

munge = %w(received delivered-to)
skip = %w(content-type content-transfer-encoding)

$LOAD_PATH.unshift File.expand_path('../../lib', __FILE__)
require 'mail'
require 'whimsy/asf'

ASF::Mail.configure

original = Mail.new(STDIN.read)
exit unless original.from.include? "builds@travis-ci.org"

copy = Mail.new

# copy/munge/skip headers
original.header.fields.each do |field|
  name = field.name
  next if skip.include? name.downcase
  name = "X-#{name}" if munge.include? name.downcase

  if name.downcase == 'to'
    copy.header['To'] = '<notifications@whimsical.apache.org>'
  else
    copy.header[name] = field.value
  end
end

# copy content
copy.text_part = original.text_part if original.text_part
copy.html_part = original.html_part if original.html_part

# deliver
copy.deliver!
