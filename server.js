/*
CSC3916 HW4
File: Server.js
Description: Web API scaffolding for Movie API
 */

var express = require('express');
var bodyParser = require('body-parser');
var passport = require('passport');
var authController = require('./auth');
var authJwtController = require('./auth_jwt');
var jwt = require('jsonwebtoken');
var cors = require('cors');
var User = require('./Users');
var Movie = require('./Movies');
var Review = require('./Reviews');

var app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(passport.initialize());

var router = express.Router();

router.post('/signup', function(req, res) {
    if (!req.body.username || !req.body.password) {
        res.json({success: false, msg: 'Please include both username and password to signup.'})
    } else {
        var user = new User();
        user.name = req.body.name;
        user.username = req.body.username;
        user.password = req.body.password;

        user.save(function(err){
            if (err) {
                if (err.code == 11000)
                    return res.json({ success: false, message: 'A user with that username already exists.'});
                else
                    return res.json(err);
            }

            res.json({success: true, msg: 'Successfully created new user.'})
        });
    }
});

router.post('/signin', function (req, res) {
    var userNew = new User();
    userNew.username = req.body.username;
    userNew.password = req.body.password;

    User.findOne({ username: userNew.username }).select('name username password').exec(function(err, user) {
        if (err) {
            res.send(err);
        }

        user.comparePassword(userNew.password, function(isMatch) {
            if (isMatch) {
                var userToken = { id: user.id, username: user.username };
                var token = jwt.sign(userToken, process.env.SECRET_KEY);
                res.json ({success: true, token: 'JWT ' + token});
            }
            else {
                res.status(401).send({success: false, msg: 'Authentication failed.'});
            }
        })
    })
});

router.route('/movies')
  .get(authJwtController.isAuthenticated, async (req, res) => {
    const ExistingReviews = req.query.reviews === 'true';
    try {
      if (ExistingReviews) {
        const moviesWithReviews = await Movie.aggregate([
          {
              $lookup: {
                from: 'reviews',
                localField: '_id',
                foreignField: 'movieId',
                as: 'reviews'
              }
            },
            {
              $addFields: {
                avgRating: {
                  $cond: {
                    if: { $gt: [ { $size: "$reviews" }, 0 ] },
                    then: { $avg: "$reviews.rating" },
                    else: null
                  }
                }
              }
            },
            {
                $sort: {
                    avgRating: -1,
                    title: 1
                }
            }
        ]);
        return res.status(200).json(moviesWithReviews);
      } else {
        const movies = await Movie.find();
        return res.status(200).json(movies);
      }
    } catch (err) {
      res.status(500).json({ success: false, message: 'Error fetching movies.', error: err.message });
    }
  })
  .post(authJwtController.isAuthenticated, async (req, res) => {
    if (!req.body.title || !req.body.releaseDate || !req.body.genre || !req.body.actors || req.body.actors.length < 3) {
        return res.status(400).json({ success: false, msg: 'Missing required movie fields or less than 3 actors.' });
    }

    try {
        const newMovie = new Movie(req.body);
        await newMovie.save();
        res.status(200).json({ success: true, message: 'Movie added successfully.', movie: newMovie });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error saving movie.' });
    }
});

router.route('/movies/:title')
  .get(authJwtController.isAuthenticated, async (req, res) => {
      try {
          const movie = await Movie.findOne({ title: req.params.title });
          if (!movie) return res.status(404).json({ success: false, msg: 'Movie not found.' });

          res.status(200).json({ success: true, movie });
      } catch (err) {
          res.status(500).json({ success: false, message: 'Error retrieving movie.' });
      }
  })
  .put(authJwtController.isAuthenticated, async (req, res) => {
      try {
          const movieUpdated = await Movie.findOneAndUpdate(
              { title: req.params.title },
              req.body,
              { new: true }
          );
          if (!movieUpdated) return res.status(404).json({ success: false, msg: 'Movie not found.' });

          res.status(200).json({ success: true, message: 'Movie updated successfully.', movie: updatedMovie });
      } catch (err) {
          res.status(500).json({ success: false, message: 'Error updating movie.' });
      }
  })
  .delete(authJwtController.isAuthenticated, async (req, res) => {
      try {
          const movieDeleted = await Movie.findOneAndDelete({ title: req.params.title });
          if (!movieDeleted) return res.status(404).json({ success: false, msg: 'Movie not found.' });

          res.status(200).json({ success: true, message: 'Movie deleted successfully.' });
      } catch (err) {
          res.status(500).json({ success: false, message: 'Error deleting movie.' });
      }
  });

router.route('/reviews')
    // GET all reviews or (optionally) filter
    .get(async (req, res) => {
      try {
        const reviews = await Review.find({});
        return res.status(200).json({ success: true, reviews: reviews });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Error fetching reviews.' });
      }
    })
    // POST a new review
    .post(authJwtController.isAuthenticated, async (req, res) => {
      try {
        const { movieId, username, review, rating } = req.body;
  
        // Basic validations
        if (!movieId || !username || !review || rating == null) {
          return res.status(400).json({ success: false, message: 'Missing required fields (movieId, username, review, rating).' });
        }
  
        // Make sure the movie exists
        const movieDoc = await Movie.findById(movieId);
        if (!movieDoc) {
          return res.status(404).json({ success: false, message: 'Movie not found in DB.' });
        }
  
        // Create the review
        const newReview = new Review({ movieId, username, review, rating });
        await newReview.save();
  
        // Extra credit: track analytics
        try {
          await trackDimension(
            movieDoc.genre,          // category
            'POST /reviews',         // action
            'API Request for Movie Review', // label
            '1',                     // event value
            movieDoc.title,          // custom dimension (cd1)
            '1'                      // custom metric (cm1)
          );
        } catch (gaErr) {
          console.log("Google Analytics tracking failed:", gaErr);
        }
  
        return res.status(200).json({ message: 'Review created!' });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Error creating review.' });
      }
    });
  
// If you want to handle deleting reviews:
router.delete('/reviews/:id', authJwtController.isAuthenticated, async (req, res) => {
    try {
      const reviewDelete = await Review.findByIdAndDelete(req.params.id);
      if (!reviewDelete) {
        return res.status(404).json({ success: false, message: 'Review not found.' });
      }
      return res.status(200).json({ success: true, message: 'Review deleted.' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Error deleting review.' });
    }
  });

app.use('/', router);
app.listen(process.env.PORT || 8080);
module.exports = app; // for testing only


