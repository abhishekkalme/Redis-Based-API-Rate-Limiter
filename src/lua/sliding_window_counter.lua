-- Sliding Window Counter Lua Script
-- KEYS[1] = counter key
-- ARGV[1] = window size (ms)
-- ARGV[2] = max requests

local key = KEYS[1]
local windowMs = tonumber(ARGV[1])
local max = tonumber(ARGV[2])

local count = redis.call('INCR', key)
local ttl = redis.call('PTTL', key)

if count == 1 then
    redis.call('PEXPIRE', key, windowMs)
    ttl = windowMs
end

local allowed = 0
local retryAfter = 0

if count <= max then
    allowed = 1
else
    retryAfter = math.ceil(ttl / 1000)
end

return {allowed, count, max, retryAfter}
