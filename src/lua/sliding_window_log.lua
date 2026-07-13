-- Sliding Window Log Lua Script
-- KEYS[1] = log key (sorted set)
-- ARGV[1] = window size (ms)
-- ARGV[2] = max requests
-- ARGV[3] = current timestamp (ms)

local key = KEYS[1]
local windowMs = tonumber(ARGV[1])
local max = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local windowStart = now - windowMs
redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
local count = redis.call('ZCARD', key)
local allowed = 0
local retryAfter = 0

if count < max then
    redis.call('ZADD', key, now, now .. ':' .. math.random())
    redis.call('EXPIRE', key, math.ceil(windowMs / 1000) + 1)
    allowed = 1
else
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    if oldest[2] then
        retryAfter = math.ceil((tonumber(oldest[2]) + windowMs - now) / 1000)
    end
end

return {allowed, count + (allowed == 1 and 1 or 0), max, retryAfter}
