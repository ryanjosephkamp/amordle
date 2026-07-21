import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { RuntimeProviders } from './app/RuntimeProviders';
import { router } from './app/router';
import './styles/global.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Amordle root element was not found.');
}

createRoot(root).render(
  <StrictMode>
    <RuntimeProviders>
      <RouterProvider router={router} />
    </RuntimeProviders>
  </StrictMode>,
);
