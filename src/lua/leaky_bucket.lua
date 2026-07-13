-- Leaky Bucket Lua Script
-- KEYS[1] = bucket key
-- ARGV[1] = max water level (capacity)
-- ARGV[2] = leak rate (water per sec)
-- ARGV[3] = current timestamp (ms)
-- ARGV[4] = water to add (usually 1)

local key = KEYS[1]
local maxLevel = tonumber(ARGV[1])
local leakRate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local addWater = tonumber(ARGV[4])

local bucket = redis.call('HMGET', key, 'water', 'lastLeak')
local water = tonumber(bucket[1])
local lastLeak = tonumber(bucket[2])

if water == nil then
    water = 0
    lastLeak = now
end

local elapsed = (now - lastLeak) / 1000
local leaked = math.floor(elapsed * leakRate)
water = math.max(0, water - leaked)
local newLastLeak = (leaked > 0) and now or lastLeak

local allowed = 0
local retryAfter = 0

if water + addWater <= maxLevel then
    water = water + addWater
    allowed = 1
else
    retryAfter = math.ceil((water + addWater - maxLevel) / leakRate)
end

redis.call('HMSET', key, 'water', water, 'lastLeak', newLastLeak)
redis.call('EXPIRE', key, math.ceil(maxLevel / leakRate) * 2 + 10)

return {allowed, water, maxLevel, retryAfter}
