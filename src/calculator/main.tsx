import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CalculatorApp from './CalculatorApp';

const root = document.getElementById('telegram-cost-calculator-root');

if (root) {
  createRoot(root).render(
    <StrictMode>
      <CalculatorApp />
    </StrictMode>,
  );
}
