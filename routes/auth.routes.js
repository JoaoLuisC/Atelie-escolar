const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { getProfileRoleByUserId } = require('../services/supabase-auth');

const router = express.Router();

router.get('/auth/me', authenticate, async (req, res, next) => {
  try {
    const role = await getProfileRoleByUserId(req.auth.user.id);
    return res.status(200).json({
      success: true,
      user: {
        id: req.auth.user.id,
        email: req.auth.user.email,
        role: role || null,
      },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
