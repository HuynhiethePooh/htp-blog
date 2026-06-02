<template>
    <div class="burger-rankings">
      <h1>Dan's Burger Rankings</h1>
      <div class="burger-grid">
        <div v-for="(burger, index) in burgers" :key="index" class="burger-card">
          <img :src="burger.image" :alt="burger.name" class="burger-image" />
          <div class="burger-info">
            <h2>{{ index + 1 }}. {{ burger.name }}</h2>
            <p class="place">{{ burger.place }}</p>
            <div class="rating">
              <span v-for="n in Math.floor(burger.rating)" :key="n" class="star">⭐</span>
              <span v-if="burger.rating % 1 !== 0" class="star-half">⭐</span>
              <span class="rating-value">{{ burger.rating.toFixed(1) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>
  
  <script>
  export default {
    name: "BurgerRankings",
    data() {
      return {
        burgers: [
          { 
            name: "Classic Cheeseburger", 
            place: "Burger House", 
            rating: 5, 
            image: "/images/classic-cheeseburger.jpg" 
          },
          { 
            name: "BBQ Bacon Burger", 
            place: "Grill Spot", 
            rating: 4.7, 
            image: "/images/bbq-bacon-burger.jpg" 
          },
          { 
            name: "Veggie Delight", 
            place: "Green Eats", 
            rating: 3.2, 
            image: "/images/veggie-delight.jpg" 
          },
        ],
      };
    },
  };
  </script>
  
  <style scoped>
  .burger-rankings {
    font-family: Arial, sans-serif;
    padding: 2rem;

    border-radius: 8px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }
  h1 {
    text-align: center;
    color: #d9534f;
  }
  .burger-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.5rem;
  }
  .burger-card {
    background-color: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    transition: transform 0.2s;
  }
  .burger-card:hover {
    transform: scale(1.05);
  }
  .burger-image {
    width: 100%;
    height: 200px;
    object-fit: cover;
  }
  .burger-info {
    padding: 1rem;
    text-align: center;
  }
  h2 {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
  }
  .place {
    color: #757575;
    font-size: 1rem;
    margin-bottom: 0.5rem;
  }
  .rating {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.25rem;
  }
  .star, .star-half {
    color: #ffd700;
    font-size: 1.25rem;
  }
  .rating-value {
    font-size: 1rem;
    font-weight: bold;
    color: #333;
    margin-left: 0.5rem;
  }
  </style>
  