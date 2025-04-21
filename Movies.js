var mongoose = require('mongoose');
var Schema = mongoose.Schema;

mongoose.connect(process.env.DB);

// Movie schema
var MovieSchema = new Schema({
    title: {
        type: String,
        required: true,
        index: true
      },
      releaseDate: {
        type: Number,
        min: [1900, 'Must be greater than 1899'],
        max: [2100, 'Must be less than 2100']
      },
      genre: {
        type: String,
        enum: [
          'Action',
          'Adventure',
          'Comedy',
          'Drama',
          'Fantasy',
          'Horror',
          'Mystery',
          'Thriller',
          'Western',
          'Science Fiction'
        ],
        required: true
      },
      imageUrl: String,
      actors: [
        {
          actorName: { type: String, required: true },
          characterName: { type: String, required: true }
        }
      ]
});

// return the model
module.exports = mongoose.model('Movie', MovieSchema);