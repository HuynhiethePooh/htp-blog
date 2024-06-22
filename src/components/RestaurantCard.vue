<template>
    <div class="card">
      <img :src="image" alt="Restaurant Image" class="card-image" />
      <div class="card-content">
        <h2 class="card-title">{{ name }}</h2>
        <p class="card-description">{{ description }}</p>
        <p class="card-rating">Rating: {{ rating }}</p>
      </div>
    </div>
  </template>
  
  <script>
  export default {
    name: 'RestaurantCard',
    props: {
      name: {
        type: String,
        required: true
      },
      description: {
        type: String,
        required: true
      },
      rating: {
        type: Number,
        required: true
      },
      image: {
        type: String,
        required: true
      }
    }
  };
  </script>
  
  <style scoped>
  .card {
    border: 1px solid #ccc;
    border-radius: 5px;
    overflow: hidden;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    width: 300px; /* This ensures the cards have a fixed width */
    margin: 10px;
  }
  .card-image {
    width: 100%;
    height: 200px;
    object-fit: cover;
  }
  .card-content {
    padding: 15px;
  }
  .card-title {
    font-size: 1.5em;
    margin-bottom: 10px;
  }
  .card-description {
    font-size: 1em;
    margin-bottom: 10px;
  }
  .card-rating {
    font-size: 1em;
    color: #555;
  }
  </style>
  