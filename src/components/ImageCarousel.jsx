// src/components/ImageCarousel.jsx
import React from 'react';
import { Carousel } from 'react-responsive-carousel';
import 'react-responsive-carousel/lib/styles/carousel.min.css'; // Ensure this import is correct

const ImageCarousel = ({ images }) => {
  console.log(images); // Debugging statement
  return (
    <Carousel showThumbs={false} infiniteLoop useKeyboardArrows autoPlay>
      {images.map((image, index) => (
        <div key={index}>
          <img src={image} alt={`Slide ${index + 1}`} />
        </div>
      ))}
    </Carousel>
  );
};

export default ImageCarousel;
