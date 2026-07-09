// Simple unit test for Counter.svelte
// Uses @testing-library/svelte + vitest + jsdom
// Keep tests minimal and fast.

import { render, screen, fireEvent } from '@testing-library/svelte';
import Counter from './Counter.svelte';

describe('Counter', () => {
  it('renders initial count 0', () => {
    // Render component
    render(Counter);

    // Assert button text contains initial state
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('Count is 0');
  });

  it('increments on click', async () => {
    render(Counter);

    const button = screen.getByRole('button');

    // Simulate user click
    await fireEvent.click(button);

    // After one click, count should be 1
    expect(button).toHaveTextContent('Count is 1');

    // Click again
    await fireEvent.click(button);
    expect(button).toHaveTextContent('Count is 2');
  });
});
