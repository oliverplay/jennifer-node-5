const express = require("express");
const router = express.Router();
const {
  uploadFile,
  getUsers,
  login,
  signup,
  logout,
  avatarUpload,
  updateFile,
} = require("../../controllers/contactsController");

router.route("/").get(getUsers);
router.route("/users/login").post(login);
router.route("/users/signup").post(signup);
router.route("/users/logout").post(logout);
router.route("/users/upload").post(avatarUpload, uploadFile);
router.route("/users/avatars").patch(avatarUpload, updateFile);

module.exports = router;
