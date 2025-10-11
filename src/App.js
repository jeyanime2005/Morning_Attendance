import React from 'react';
import EmployeeCheckIn from './components/Pages/EmployeeCheckIn';
import Header from './components/Header/Header';
import './App.css';

function App() {
    return (
        <div className="App">
            <Header />
            <EmployeeCheckIn />
        </div>
    );
}

export default App;