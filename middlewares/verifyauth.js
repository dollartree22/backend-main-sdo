const jwt = require("jsonwebtoken");
const User = require("../model/user.js");
const Admin = require("../model/Admin.js");
const ErrorHander = require("./errorhandler.js");

// Extract token from Authorization header
const extractToken = (header) => {
  if (!header) return null;
  
  const parts = header.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') {
    return parts[1];
  }
  return header; // Fallback for old token format
};

function isTokenExpired(req, res, next) {
  let tokenHeader = req.header("Authorization") || req.header("Authentication");
  if (!tokenHeader) {
    return next(new ErrorHander("No token provided", 403));
  }

  const token = extractToken(tokenHeader);
  if (!token) {
    return next(new ErrorHander("Invalid token format", 401));
  }

  try {
    const decodedToken = jwt.decode(token);
    if (decodedToken && decodedToken.exp) {
      const currentTime = Math.floor(Date.now() / 1000);
      if (decodedToken.exp < currentTime) {
        return next(new ErrorHander("Token has expired", 401));
      }
    }
    next();
  } catch (error) {
    return next(new ErrorHander("Invalid token", 401));
  }
}

function verifyToken(req, res, next) {
  let tokenHeader = req.header("Authorization") || req.header("Authentication");
  if (!tokenHeader) {
    return next(new ErrorHander("No token provided", 403));
  }

  const token = extractToken(tokenHeader);
  if (!token) {
    return next(new ErrorHander("Invalid token format", 401));
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return next(new ErrorHander("Token has expired", 401));
      }
      if (err.name === 'JsonWebTokenError') {
        return next(new ErrorHander("Invalid token", 401));
      }
      return next(new ErrorHander("Authentication failed", 401));
    }
    
    req._id = decoded.id;
    req.decoded = decoded;
    next();
  });
}

async function isadmin(req, res, next) {
  let tokenHeader = req.header("Authorization") || req.header("Authentication");
  if (!tokenHeader) {
    return next(new ErrorHander("No token provided", 403));
  }

  const token = extractToken(tokenHeader);
  if (!token) {
    return next(new ErrorHander("Invalid token format", 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req._id = decoded.id;
    
    const user = await Admin.findById(decoded.id);
    if (!user) {
      return next(new ErrorHander('Admin not found', 404));
    }
    if (user.role !== 'admin') {
      return next(new ErrorHander('Unauthorized access', 403));
    }
    
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new ErrorHander("Token has expired", 401));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(new ErrorHander("Invalid token", 401));
    }
    return next(new ErrorHander("Authentication failed", 401));
  }
}

module.exports = { isadmin, verifyToken, isTokenExpired };