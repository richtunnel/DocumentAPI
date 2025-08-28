const jwt = require('jsonwebtoken');

const payload = {
  sub: 'test-user',
  role: 'subscriber', // Adjust based on your role-based permissions
  iss: 'Milestone',
  aud: '',
  exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour expiry
};

const secret = process.env.JWT_SECRET || 'DKFJ8E8JdfjejdC6Vw8UWUupq09mVQzkADKl0CC2Ad70LnKYqjiRIdj6JxFOg2cU08scYb0UnyICTusue7skdkjfukdkje7T';
const token = jwt.sign(payload, secret);
console.log('JWT Token:', token);