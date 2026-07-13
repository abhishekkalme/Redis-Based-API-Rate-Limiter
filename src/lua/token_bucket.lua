-- Token Bucket Lua Script
-- KEYS[1] = bucket key
-- ARGV[1] = max tokens (capacity)
-- ARGV[2] = refill rate (tokens/sec)
-- ARGV[3] = current timestamp (ms)
-- ARGV[4] = cost (usually 1)

local key = KEYS[1]
local maxTokens = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

local bucket = redis.call('HMGET', key, 'tokens', 'lastRefill')
local tokens = tonumber(bucket[1])
local lastRefill = tonumber(bucket[2])

if tokens == nil then
    tokens = maxTokens
    lastRefill = now
end

local elapsed = (now - lastRefill) / 1000
local refill = math.floor(elapsed * refillRate)

if refill > 0 then
    tokens = math.min(maxTokens, tokens + refill)
    lastRefill = now
end

local allowed = 0
local retryAfter = 0

if tokens >= cost then
    tokens = tokens - cost
    allowed = 1
else
    retryAfter = math.ceil((cost - tokens) / refillRate)
end

redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', lastRefill)
redis.call('EXPIRE', key, math.ceil(maxTokens / refillRate) * 2 + 10)

return {allowed, tokens, maxTokens, retryAfter}
