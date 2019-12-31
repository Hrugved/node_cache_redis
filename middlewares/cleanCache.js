const {clearCache} = require('../services/cache')

module.exports = async(req,res,next) => {
  await next() // clever trick to run middleware after running next
  clearhash(req.user.id)
}