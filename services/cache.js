const mongoose = require('mongoose')
const redis = require('redis')
const redisUrl = 'redis://127.0.0.1:6379'
const client  = redis.createClient(redisUrl)
// client.flushall()

const util = require('util') // core node module
client.hget = util.promisify(client.hget)
client.hset = util.promisify(client.hset)
const exec = mongoose.Query.prototype.exec

// declaring a custom method on query-instance 
mongoose.Query.prototype.cache = function(options = {}) { // custom arg
  this.useCache = true // turning-on custom flag on this query, which will tell caching func whether to cache this query or not
  this.hashKey = JSON.stringify(options.key || 'noKey') // custom prop which specifies the top-level hashing key, stringfying to ensure key is always string(redis works with string and numbers only)
  return this //to make it chain-able method
}

mongoose.Query.prototype.exec = async function () {
  if(!this.useCache) {
    // dont cache this query
    const result = await exec.apply(this,arguments)
    return result
  }

  //cache this query
  const key = JSON.stringify({
    ...this.getQuery(),
    collection: this.mongooseCollection.name
  })

  const cacheValue = await client.hget(this.hashKey,key)
  if(cacheValue) {
    // redis works with json, so during inserting of object(which is a moongoose model instance that contains additional methods like get,set,etc...) into redis, we strigified it to convert it into JSON which changes the original object
    // so during returning that cached value we pass it into model() constructor which restores that json data into original moongoose model instance before returning it, because while querying our code assumes that it will get back a monngose object
    const doc = JSON.parse(cacheValue)
    return Array.isArray(doc) ?
            doc.map(d => new this.model(d)) // imp: the model() constructor should be called on each json-data, so iterate if cached is array of json-data's
            : new this.model(doc) 
  }

  const result = await exec.apply(this,arguments)
  client.hset(this.hashKey,key,JSON.stringify(result), 'EX', 10) // EX: expire in 10s
  return result
}

module.exports = {
  clearCache(hkey) {
    client.del(JSON.stringify(hkey))
  }
}