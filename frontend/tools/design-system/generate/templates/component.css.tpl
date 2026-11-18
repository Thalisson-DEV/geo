:host {
  display: block;
  min-width: 0;
}

:host(:focus-visible) {
  outline: var(--geo-focus-ring-width, 0.125rem) solid var(--geo-focus-ring-color, currentColor);
  outline-offset: var(--geo-focus-ring-offset, 0.125rem);
}

@media (prefers-reduced-motion: reduce) {
  :host {
    scroll-behavior: auto;
  }
}
