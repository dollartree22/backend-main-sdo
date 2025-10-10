const jwt = require("jsonwebtoken");
const User = require("../model/user.js");
const Admin = require("../model/Admin.js");
const ErrorHander = require("./errorhandler.js");
function isTokenExpired(req, res, next) {
  let token = req.header("Authentication");

  const decodedToken = jwt.decode(token);
  if (decodedToken && decodedToken.exp) {
    const currentTime = Math.floor(Date.now() / 1000); // Convert milliseconds to seconds
    if (decodedToken.exp < currentTime) {
      return next(new ErrorHander("Wrong Otp or OTP has expired"));
    }
  }

  next(); // Call the next middleware if the token is still valid or if decoding fails
}
function verifyToken(req, res, next) {
  let token = req.header("Authentication");
  if (!token) {
    return res.status(403).send({ message: "No token provided" });
  }

  jwt.verify(token,process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: err.message });
    }
    req._id = decoded.id;
    req.decoded = decoded;
    next();
  });
};

async function isadmin(req, res, next) {
  let token = req.header("Authentication");
  if (!token) {
    return res.status(403).send({ message: "No token provided" });
  }

  jwt.verify(token,process.env.JWT_SECRET, async(err, decoded) => {
    if (err) {
      return res.status(401).send({ message: err.message });
    }
    req._id=decoded.id
    const user = await Admin.findById(decoded.id);
    if (user === null) {
      return next(new ErrorHander('Login to continue', 405));
    }
    if (user.role !== 'admin') {
      return next(new ErrorHander('Unauthorized', 401));
    }
    next()
  });
 
}

module.exports = { isadmin, verifyToken ,isTokenExpired}