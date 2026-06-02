<template>
    <div>
      <ul>
        <li v-for="(burger, index) in burgerList" :key="index">
          <span class="burger-name">{{ burger.name }}</span> from 
          <span class="restaurant">{{ burger.restaurant }}</span> 
          — Rating: {{ burger.rating }}
        </li>
      </ul>
      <form @submit.prevent="addBurger" class="burger-form">
        <input v-model="newBurger.name" placeholder="Burger Name" required />
        <input v-model="newBurger.restaurant" placeholder="Restaurant" required />
        <input v-model="newBurger.rating" placeholder="Rating" required />
        <button type="submit">Add Burger</button>
      </form>
    </div>
  </template>
  
  <script>
  export default {
    data() {
      return {
        burgerList: [
          { name: "Classic Cheeseburger", restaurant: "Burger Haven", rating: "9/10" },
          { name: "Smash Burger", restaurant: "Grill Masters", rating: "8.5/10" },
        ],
        newBurger: {
          name: "",
          restaurant: "",
          rating: "",
        },
      };
    },
    methods: {
      addBurger() {
        this.burgerList.push({ ...this.newBurger });
        this.newBurger = { name: "", restaurant: "", rating: "" };
      },
    },
  };
  </script>
  
  <style scoped>
  ul {
    list-style-type: none;
    padding: 0;
  }
  li {
    margin: 1rem 0;
    padding: 0.5rem;
    background: #efefef;
    border-radius: 4px;
  }
  .burger-name {
    font-weight: bold;
  }
  .restaurant {
    font-style: italic;
  }
  .burger-form {
    margin-top: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  input {
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  button {
    padding: 0.5rem;
    background: #007bff;
    color: white;
   }  
   </style>