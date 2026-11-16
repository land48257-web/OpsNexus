import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
import './lib/monaco' // Initialize Monaco Editor configuration
import { getBasePath } from './lib/basePath'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <BrowserRouter basename={getBasePath() || '/'}>
            <App />
        </BrowserRouter>
    </React.StrictMode>,
)
