<template>
  <div style="padding: 10px; border: 1px solid #ccc; border-radius: 5px;">
    <h1>Hello, {{ name }}!</h1>
    <p>Welcome to our website. We're glad to have you here!</p>
  </div>
</template>

<script>
export default {
  name: 'Greeting',
  props: {
    name: {
      type: String,
      required: true
    }
  }
};
</script>

<style scoped>
/* Add any component-specific styles here */
</style>
