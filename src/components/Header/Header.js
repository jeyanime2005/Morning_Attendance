import React from 'react';
import './Header.css';

const Header = () => {
    const getCurrentDateTime = () => {
        const now = new Date();
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        };
        const date = now.toLocaleDateString('en-US', options);
        const time = now.toLocaleTimeString('en-US');
        return `${date}  ${time}`;
    };

    return (
        <div className="main-header">
            <h1>Morning Meeting Attendance</h1>
            <div className="datetime">{getCurrentDateTime()}</div>
            {/* <h2>Employee Check-in</h2>
            <p>Please complete the form below</p> */}
        </div>
    );
};

export default Header;