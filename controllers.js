const Users = require("../models/users");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const fs = require("fs").promises;
const path = require("path");
const gravatar = require("gravatar");
const Jimp = require("jimp");
const uploadPath = path.join(process.cwd(), "tmp"); // Temporary storage for uploads

// console.log(imagesPath);
// console.log(uploadPath)

const storage = multer.memoryStorage();
const upload = multer({ storage });

const contactsController = {
  async getUsers(req, res) {
    try {
      // using firestore data to retrieve the users instead of mongoDB
      // const query = await getDocs(collection(db, 'users'));
      // const data = [];
      // query.forEach(doc => {
      //   data.push(doc.data());
      // });
      // res.json(data);
      const data = await Users.find();
      const hashed = await bcrypt.hash("abc123", 10); // salt = adding random letters at the end
      const token = await jwt.sign(
        { email: "abc@gmail.com" },
        process.env.JWT_SECRET,
        {
          // tokens can expire and are timed sensitive (this is the difference between bcrypt)
          expiresIn: "1h",
        }
      ); // jwt takes in a key after object
      // the token instance changes everytime it runs
      console.log(token);
      console.log("abc123", hashed);
      res.json(data);
    } catch (error) {
      console.log(error);
      res.json(error);
    }
  },
  async signup(req, res, next) {
    try {
      const { email, password } = req.body;

      // Check if the user exists
      const userExist = await Users.findOne({ email: email });
      if (userExist) {
        return res.status(409).json({
          status: "error",
          code: 409,
          message: "Email is already in use",
          data: "Conflict",
        });
      }

      // Hash the password
      const hashed = await bcrypt.hash(password, 10);

      // Create a token
      const token = jwt.sign({ email }, process.env.JWT_SECRET, {
        expiresIn: "1hr",
      });

      // Create an avatar
      const avatarURL = "https:" + gravatar.url(email);

      // Create a new user
      const newUser = await Users.create({
        email: email,
        password: hashed,
        token: token,
        avatarURL: avatarURL,
      });

      await newUser.save();

      // Store the token in the session
      req.session.userToken = token;

      res.status(201).json({
        status: "success",
        code: 201,
        data: {
          message: "Registration successful",
          token,
        },
      });
    } catch (err) {
      next(err);
    }
  },
  async login(req, res) {
    try {
      const { email, password } = req.body;
      // const signedInUser = await signInWithEmailAndPassword(auth, email, password);
      // const user = signedInUser.user
      // if(!user.emailVerified) {
      //   res.json({ message: 'Please verify your email to continue'})
      // }
      // res.json(user.stsTokenManager);
      //   calls the database and looks for user
      const singleUser = await Users.findOne({ email: email });
      if (!singleUser) {
        res.status(400).json({
          status: "error",
          code: 400,
          message: "No user found in the database",
          data: "Bad request",
        });
        return;
      }
      // bcrypt can be used to check if password checks out
      const validatingPW = await singleUser.checkPassword(password);
      if (!validatingPW) {
        res.status(400).json({
          status: "error",
          code: 400,
          message: "Wrong Password",
          data: "Bad request",
        });
        return;
      }

      // to create a new token
      const token = jwt.sign({ email }, process.env.JWT_SECRET, {
        expiresIn: "1hr",
      });
      // mongodb syntax to add the token to database * needed to save to db to retrieve
      singleUser.token = token;
      await singleUser.save();

      // this is the new way = make a new session token
      //   tells the user that we are authenticated and signed in
      req.session.userToken = token;
      res.status(200).json({
        status: "success",
        code: 200,
        data: {
          token,
        },
      });
    } catch (err) {
      console.log(err);
      res.json(err);
    }
  },
  async logout(req, res) {
    try {
      if (req.session.userToken) {
        req.session.destroy(() => {
          res.json({ message: "User was signed out" });
        });
      } else {
        res.json({ message: "You are already signed out!" });
      }

      // try {
      //   await signOut(auth);
      //   res.json({ message: 'You are signed out'});
    } catch (err) {
      res.json(err);
    }
  },

  // This is a middleware that uses the 'upload' multer instance to handle a single file upload with the field name "avatar".
  avatarUpload: upload.single("avatar"),

  async uploadFile(req, res) {
    try {
      const { email } = req.body; // Extract the email from the request body

      // Get the uploaded file buffer
      const uploadedFileBuffer = req.file.buffer;

      // Create a unique filename based on the email and timestamp
      const uniqueFileName = `${email}-${Date.now()}.jpg`;

      // Construct the path to the avatars directory
      const avatarPath = path.join(process.cwd(), "public", "avatars");

      // Create a path for the temporary file in the tmp folder
      const tmpFilePath = path.join(uploadPath, uniqueFileName);

      // Write the binary data to the temporary file
      await fs.writeFile(tmpFilePath, uploadedFileBuffer);

      // Resize and rename the image using Jimp
      const resizedFilePath = path.join(avatarPath, uniqueFileName);
      const jimpImage = await Jimp.read(tmpFilePath);
      await jimpImage.resize(250, 250); // Resize the image
      await jimpImage.writeAsync(resizedFilePath);

      // Find the user based on their email and update their avatarURL field
      const updatedUser = await Users.findOneAndUpdate(
        { email: email },
        { avatarURL: `/avatars/${uniqueFileName}` }, // Update the avatarURL field with the unique filename
        { new: true } // Return the updated user object
      );

      // Send a JSON response indicating successful avatar upload along with the updated user object
      res.json({
        message: "Avatar uploaded successfully",
        user: updatedUser,
      });

      // Delete the temporary file from the tmp folder
      await fs.unlink(tmpFilePath);
    } catch (error) {
      console.log("Error uploading avatar", error); // Log the error if something goes wrong
      res.status(500).json({ message: "Error uploading avatar" }); // Send an error response with a 500 status code
    }
  },

  async updateFile(req, res) {
    try {
      const userEmail = req.body.email;

      // Find the user in the database based on their email
      const user = await Users.findOne({ email: userEmail });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Handle the previous avatar (delete the old one if exists)
      if (user.avatarURL) {
        const previousAvatarPath = path.join(
          process.cwd(),
          "public",
          user.avatarURL
        );

        // Check if the previous avatar file exists before attempting to delete it
        await fs.access(previousAvatarPath);

        // Delete the previous avatar image
        await fs.unlink(previousAvatarPath);
      }

      // Get the uploaded file buffer
      const uploadedFileBuffer = req.file.buffer;

      // Create a unique filename based on the user's email and timestamp
      const uniqueFileName = `${userEmail}-${Date.now()}.jpg`;

      // Construct the path to the avatars directory
      const avatarPath = path.join(process.cwd(), "public", "avatars");

      // Create a path for the new avatar file
      const newAvatarFilePath = path.join(avatarPath, uniqueFileName);

      // Write the binary data to the new avatar file
      await fs.writeFile(newAvatarFilePath, uploadedFileBuffer);

      // Resize the new avatar image if necessary
      const jimpImage = await Jimp.read(newAvatarFilePath);
      await jimpImage.resize(250, 250); // Resize the image to your desired dimensions
      await jimpImage.writeAsync(newAvatarFilePath);

      // Update the user's avatarURL field in the database
      user.avatarURL = `/avatars/${uniqueFileName}`;
      await user.save();

      res.json({
        message: "Avatar updated successfully",
        avatarURL: user.avatarURL,
      });
    } catch (error) {
      console.error("Error updating avatar", error);
      res.status(500).json({ message: "Error updating avatar" });
    }
  },
};

module.exports = contactsController;
