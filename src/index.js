import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import {
  Route,
  Routes,
  BrowserRouter,
  Navigate,
  useLocation,
} from "react-router-dom";

const PreserveQueryNavigate = () => {
  const location = useLocation();

  // Get the search parameters from the current location
  const searchParams = location.search;

  // Construct the new path with the existing query parameters
  const newPath = `/datacouncil${searchParams}`;

  return <Navigate to={newPath} replace />;
};

export default PreserveQueryNavigate;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PreserveQueryNavigate />} />
        <Route path="/:source" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
