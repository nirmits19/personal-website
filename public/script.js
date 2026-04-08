// Fade-in sections as they scroll into view
const sections = document.querySelectorAll('section');

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.08 });

sections.forEach(section => {
  section.style.opacity = '0';
  section.style.transform = 'translateY(18px)';
  section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
  observer.observe(section);
});

// Also fade in immediately if already visible on load
window.addEventListener('DOMContentLoaded', () => {
  sections.forEach(section => {
    const rect = section.getBoundingClientRect();
    if (rect.top < window.innerHeight) {
      section.classList.add('visible');
    }
  });
});

// Apply visible class
document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = 'section.visible { opacity: 1 !important; transform: none !important; }';
  document.head.appendChild(style);
});
