var express = require('express')
var path = require('path')
var cookieParser = require('cookie-parser')
var logger = require('morgan')
var mysql = require('mysql2/promise')

var app = express()

app.use(logger('dev'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())

let db
;(async () => {
  try {
    // Connect to MySQL without specifying a database
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '', // Set your MySQL root password
    })

    // Create the database if it doesn't exist
    await connection.query('CREATE DATABASE IF NOT EXISTS DogWalkService')
    await connection.end()

    // Now connect to the created database
    db = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'DogWalkService',
    })

    // Create a table if it doesn't exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS Users (
          user_id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          email VARCHAR(100) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role ENUM('owner', 'walker') NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await db.execute(`
      CREATE TABLE IF NOT EXISTS Dogs (
          dog_id INT AUTO_INCREMENT PRIMARY KEY,
          owner_id INT NOT NULL,
          name VARCHAR(50) NOT NULL,
          size ENUM('small', 'medium', 'large') NOT NULL,
          FOREIGN KEY (owner_id) REFERENCES Users(user_id)
      )
    `)

    await db.execute(`
      CREATE TABLE IF NOT EXISTS WalkRequests (
          request_id INT AUTO_INCREMENT PRIMARY KEY,
          dog_id INT NOT NULL,
          requested_time DATETIME NOT NULL,
          duration_minutes INT NOT NULL,
          location VARCHAR(255) NOT NULL,
          status ENUM('open', 'accepted', 'completed', 'cancelled') DEFAULT 'open',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (dog_id) REFERENCES Dogs(dog_id)
      )
    `)

    await db.execute(`
      CREATE TABLE IF NOT EXISTS WalkApplications (
          application_id INT AUTO_INCREMENT PRIMARY KEY,
          request_id INT NOT NULL,
          walker_id INT NOT NULL,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
          FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
          FOREIGN KEY (walker_id) REFERENCES Users(user_id),
          CONSTRAINT unique_application UNIQUE (request_id, walker_id)
      )
    `)

    await db.execute(`
      CREATE TABLE IF NOT EXISTS WalkRatings (
          rating_id INT AUTO_INCREMENT PRIMARY KEY,
          request_id INT NOT NULL,
          walker_id INT NOT NULL,
          owner_id INT NOT NULL,
          rating INT CHECK (rating BETWEEN 1 AND 5),
          comments TEXT,
          rated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
          FOREIGN KEY (walker_id) REFERENCES Users(user_id),
          FOREIGN KEY (owner_id) REFERENCES Users(user_id),
          CONSTRAINT unique_rating_per_walk UNIQUE (request_id)
      )
    `)

    // Insert data if table is empty
    const [rows] = await db.execute('SELECT COUNT(*) AS count FROM Users')
    if (rows[0].count === 0) {
      await db.execute(`
        INSERT INTO users (username, email, password_hash, role)
        VALUES ('alice123', 'alice@example.com', 'hashed123', 'owner'),
            ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
            ('carol123', 'carol@example.com', 'hashed789', 'owner'),
            ('andywalker', 'andy@example.com', 'hashed000', 'walker'),
            ('jim123', 'jim@example.com', 'hashed111', 'owner')
      `)

      await db.execute(`
        INSERT INTO dogs (owner_id, NAME, size)
        VALUES ((SELECT user_id FROM users WHERE username = 'alice123'), 'Max', 'medium'),
            ((SELECT user_id FROM users WHERE username = 'carol123'), 'Bella', 'small'),
            ((SELECT user_id FROM users WHERE username = 'jim123'), 'Lily', 'large'),
            ((SELECT user_id FROM users WHERE username = 'alice123'), 'Sam', 'small'),
            ((SELECT user_id FROM users WHERE username = 'alice123'), 'Joe', 'large')
      `)

      await db.execute(`
        INSERT INTO walkrequests (dog_id, requested_time, duration_minutes, location, STATUS)
        VALUES ((SELECT dog_id FROM dogs WHERE name = 'Max'), '2025-06-10 08:00:00', '30', 'Parklands', 'open'),
            ((SELECT dog_id FROM dogs WHERE name = 'Bella'), '2025-06-10 09:30:00', '45', 'Beachside Ave', 'open'),
            ((SELECT dog_id FROM dogs WHERE name = 'Lily'), '2025-06-10 11:00:00', '30', 'Parklands', 'open'),
            ((SELECT dog_id FROM dogs WHERE name = 'Sam'), '2025-06-10 13:00:00', '30', 'Parklands', 'completed'),
            ((SELECT dog_id FROM dogs WHERE name = 'Joe'), '2025-06-10 14:00:00', '30', 'Parklands', 'completed'),
            ((SELECT dog_id FROM dogs WHERE name = 'Lily'), '2025-06-11 14:00:00', '30', 'Parklands', 'cancelled'),
            ((SELECT dog_id FROM dogs WHERE name = 'Max'), '2025-06-16 14:00:00', '20', 'Parklands', 'accepted'),
            ((SELECT dog_id FROM dogs WHERE name = 'Bella'), '2025-06-13 14:00:00', '40', 'Beachside Ave', 'completed')
      `)

      await db.execute(`
        INSERT INTO walkapplications (request_id, walker_id, applied_at, STATUS)
        VALUES ((SELECT request_id FROM walkrequests WHERE requested_time = '2025-06-10 13:00:00'), (SELECT user_id FROM users WHERE username = 'bobwalker'), '2025-06-09 10:00:00', 'accepted'),
          ((SELECT request_id FROM walkrequests WHERE requested_time = '2025-06-10 14:00:00'), (SELECT user_id FROM users WHERE username = 'bobwalker'), '2025-06-09 14:00:00', 'accepted'),
          ((SELECT request_id FROM walkrequests WHERE requested_time = '2025-06-11 14:00:00'), (SELECT user_id FROM users WHERE username = 'andywalker'), '2025-06-12 14:00:00', 'rejected'),
          ((SELECT request_id FROM walkrequests WHERE requested_time = '2025-06-16 14:00:00'), (SELECT user_id FROM users WHERE username = 'andywalker'), '2025-06-15 14:00:00', 'accepted'),
          ((SELECT request_id FROM walkrequests WHERE requested_time = '2025-06-13 14:00:00'), (SELECT user_id FROM users WHERE username = 'andywalker'), '2025-06-10 14:00:00', 'accepted')
      `)

      await db.execute(`
        INSERT INTO walkratings (request_id, walker_id, owner_id, rating, comments)
        SELECT walkapplications.request_id, walkapplications.walker_id, dogs.owner_id, 5, 'Too great!' FROM walkapplications LEFT JOIN walkrequests ON walkapplications.request_id = walkrequests.request_id LEFT JOIN dogs ON walkrequests.dog_id = dogs.dog_id WHERE applied_at = '2025-06-09 10:00:00'

        `)

      await db.execute(`
        INSERT INTO walkratings (request_id, walker_id, owner_id, rating, comments)
        SELECT walkapplications.request_id, walkapplications.walker_id, dogs.owner_id, 4.5, 'Perfect!' FROM walkapplications LEFT JOIN walkrequests ON walkapplications.request_id = walkrequests.request_id LEFT JOIN dogs ON walkrequests.dog_id = dogs.dog_id WHERE applied_at = '2025-06-09 14:00:00'

        `)

      await db.execute(`
        INSERT INTO walkratings (request_id, walker_id, owner_id, rating, comments)
        SELECT walkapplications.request_id, walkapplications.walker_id, dogs.owner_id, 1, 'Too bad!' FROM walkapplications LEFT JOIN walkrequests ON walkapplications.request_id = walkrequests.request_id LEFT JOIN dogs ON walkrequests.dog_id = dogs.dog_id WHERE applied_at = '2025-06-12 14:00:00'

        `)

      await db.execute(`
        INSERT INTO walkratings (request_id, walker_id, owner_id, rating, comments)
        SELECT walkapplications.request_id, walkapplications.walker_id, dogs.owner_id, 5, 'Too great!' FROM walkapplications LEFT JOIN walkrequests ON walkapplications.request_id = walkrequests.request_id LEFT JOIN dogs ON walkrequests.dog_id = dogs.dog_id WHERE applied_at = '2025-06-15 14:00:00'

        `)
    }
  } catch (err) {
    console.error(
      'Error setting up database. Ensure Mysql is running: service mysql start',
      err
    )
  }
})()

app.get('/api/dogs', async (req, res) => {
  try {
    const [items] = await db.execute(
      'SELECT dogs.name as dog_name, size, users.username as owner_username FROM dogs left join users on dogs.owner_id = users.user_id'
    )

    res.json(items)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dogs' })
  }
})

// My conditions are:
// walkrequests.status = "open"
app.get('/api/walkrequests/open', async (req, res) => {
  try {
    const [items] = await db.execute(
      'SELECT walkrequests.request_id, dogs.name as dog_name, requested_time, duration_minutes, location, users.username as owner_username FROM walkrequests left join dogs on dogs.dog_id = walkrequests.dog_id left join users on dogs.owner_id = users.user_id WHERE walkrequests.status = "open"'
    )

    res.json(items)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dogs' })
  }
})

// My conditions are:
// walker_id is not NULL
// walkapplications.STATUS = "accepted"
// walkrequests.STATUS = "completed"
app.get('/api/walkers/summary', async (req, res) => {
  try {
    const [items] = await db.execute(
      'SELECT username AS walker_username, total_ratings, average_rating, completed_walks FROM users LEFT JOIN (SELECT walker_id, COUNT(1) AS completed_walks FROM walkrequests LEFT JOIN walkapplications ON walkrequests.request_id = walkapplications.request_id WHERE walkrequests.STATUS = "completed" AND walkapplications.walker_id IS NOT NULL AND walkapplications.STATUS = "accepted" GROUP BY walker_id) AS r ON r.walker_id = users.user_id LEFT JOIN (SELECT walker_id, COUNT(1) as total_ratings, AVG(rating) as average_rating FROM `walkratings` WHERE walker_id is not NULL GROUP BY walker_id) AS w ON w.walker_id = users.user_id WHERE users.role = "walker"'
    )

    res.json(items)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dogs' })
  }
})

app.use(express.static(path.join(__dirname, 'public')))

module.exports = app
