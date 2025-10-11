import React, { useState, useEffect } from 'react';
import './EmployeeCheckIn.css';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

const EmployeeCheckIn = () => {
    const [formData, setFormData] = useState({
        departmentId: '',
        employeeId: '',
        employeeName: '',
        departmentName: '',
        rating: 0
    });
    const [departments, setDepartments] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [hoverRating, setHoverRating] = useState(0);
    const [loading, setLoading] = useState(false);
    const [fetchingEmployees, setFetchingEmployees] = useState(false);
    const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);
    const [ipBlocked, setIpBlocked] = useState(false);
    const [timeStatus, setTimeStatus] = useState({ 
        isPunchInAllowed: false, 
        message: 'Checking time...',
        currentTime: '--:--:--',
        timezone: 'IST'
    });
    const [timeError, setTimeError] = useState(false);

    // Fetch departments and time status on component mount
    useEffect(() => {
        fetchDepartments();
        checkTimeStatus();
        // Check time status every 30 seconds
        const interval = setInterval(checkTimeStatus, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchDepartments = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/departments`);
            const result = await response.json();
            if (result.success) {
                setDepartments(result.data);
            }
        } catch (error) {
            console.error('Error fetching departments:', error);
        }
    };

    const checkTimeStatus = async () => {
        try {
            setTimeError(false);
            const response = await fetch(`${API_BASE_URL}/api/time-status`);
            const result = await response.json();
            
            if (result.success) {
                setTimeStatus(result.data);
            } else {
                setTimeError(true);
                setTimeStatus({ 
                    isPunchInAllowed: false, 
                    message: 'Error checking server time',
                    currentTime: '--:--:--',
                    timezone: 'IST'
                });
            }
        } catch (error) {
            console.error('Error checking time status:', error);
            setTimeError(true);
            setTimeStatus({ 
                isPunchInAllowed: false, 
                message: 'Network error - Cannot check time',
                currentTime: '--:--:--',
                timezone: 'IST'
            });
        }
    };

    const fetchEmployeesByDepartment = async (departmentId) => {
        if (!departmentId) {
            setEmployees([]);
            return;
        }

        setFetchingEmployees(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/employees/${departmentId}`);
            const result = await response.json();
            if (result.success) {
                setEmployees(result.data);
            } else {
                setEmployees([]);
            }
        } catch (error) {
            console.error('Error fetching employees:', error);
            setEmployees([]);
        } finally {
            setFetchingEmployees(false);
        }
    };

    const handleDepartmentChange = (e) => {
        const departmentId = e.target.value;
        const selectedDepartment = departments.find(dept => dept.id == departmentId);
        
        setFormData({
            departmentId: departmentId,
            employeeId: '',
            employeeName: '',
            departmentName: selectedDepartment ? selectedDepartment.department_name : '',
            rating: 0
        });
        setEmployees([]);
        setAlreadyCheckedIn(false);
        setIpBlocked(false);

        if (departmentId) {
            fetchEmployeesByDepartment(departmentId);
        }
    };

    const handleEmployeeChange = (e) => {
        const employeeId = e.target.value;
        const selectedEmployee = employees.find(emp => emp.employee_id === employeeId);
        
        if (selectedEmployee) {
            setFormData(prev => ({
                ...prev,
                employeeId: selectedEmployee.employee_id,
                employeeName: selectedEmployee.employee_name,
                departmentName: selectedEmployee.department_name
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                employeeId: '',
                employeeName: '',
                departmentName: prev.departmentName
            }));
        }
        setAlreadyCheckedIn(false);
        setIpBlocked(false);
    };

    const handleRatingClick = (rating) => {
        setFormData(prevState => ({
            ...prevState,
            rating: rating
        }));
    };

    const handleRatingHover = (rating) => {
        setHoverRating(rating);
    };

    const handleRatingLeave = () => {
        setHoverRating(0);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (timeError) {
            alert('❌ Cannot verify server time. Please try again.');
            checkTimeStatus();
            return;
        }
        
        if (!timeStatus.isPunchInAllowed) {
            alert(`❌ ${timeStatus.message}`);
            return;
        }
        
        if (!formData.employeeId) {
            alert('Please select your name from the list');
            return;
        }

        if (formData.rating === 0) {
            alert('Please provide a rating');
            return;
        }
        
        setLoading(true);
        setAlreadyCheckedIn(false);
        setIpBlocked(false);
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/attendance`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    employeeId: formData.employeeId,
                    employeeName: formData.employeeName,
                    departmentName: formData.departmentName,
                    rating: formData.rating
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                alert(`✅ Thank you ${formData.employeeName}! Your attendance has been recorded.`);
                // Reset form after successful submission
                setFormData({
                    departmentId: '',
                    employeeId: '',
                    employeeName: '',
                    departmentName: '',
                    rating: 0
                });
                setEmployees([]);
                setHoverRating(0);
            } else {
                if (result.message.includes('already checked in')) {
                    setAlreadyCheckedIn(true);
                } else if (result.message.includes('device') || result.message.includes('IP')) {
                    setIpBlocked(true);
                } else if (result.message.includes('Punch-in not allowed')) {
                    // Update time status if punch-in was denied due to time
                    checkTimeStatus();
                }
                alert(`❌ ${result.message}`);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('🌐 Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const renderStars = () => {
        const stars = [];
        for (let i = 1; i <= 5; i++) {
            stars.push(
                <span
                    key={i}
                    className={`star ${i <= (hoverRating || formData.rating) ? 'filled' : ''}`}
                    onClick={() => handleRatingClick(i)}
                    onMouseEnter={() => handleRatingHover(i)}
                    onMouseLeave={handleRatingLeave}
                >
                    ★
                </span>
            );
        }
        return stars;
    };

    const isFormDisabled = loading || alreadyCheckedIn || ipBlocked || !timeStatus.isPunchInAllowed || timeError;

    return (
        <div className="container">
            <div className="form-container">
                {/* Time Status Banner */}
                <div className={`time-status-banner ${timeError ? 'error' : timeStatus.isPunchInAllowed ? 'allowed' : 'not-allowed'}`}>
                    <div className="time-status-icon">
                        {timeError ? '⚠️' : timeStatus.isPunchInAllowed ? '🟢' : '🔴'}
                    </div>
                    <div className="time-status-content">
                        <div className="time-status-message">
                            {timeStatus.message}
                        </div>
                        <div className="time-status-details">
                            Server Time: {timeStatus.currentTime} ({timeStatus.timezone})
                        </div>
                    </div>
                    <button 
                        className="refresh-time-btn"
                        onClick={checkTimeStatus}
                        title="Refresh time status"
                    >
                        🔄
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="department">Select Department</label>
                        <select 
                            id="department"
                            name="departmentId"
                            value={formData.departmentId}
                            onChange={handleDepartmentChange}
                            disabled={isFormDisabled}
                            required
                        >
                            <option value="">Select Department</option>
                            {departments.map(dept => (
                                <option key={dept.id} value={dept.id}>
                                    {dept.department_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label htmlFor="employee">Select Your Name</label>
                        <select 
                            id="employee"
                            name="employeeId"
                            value={formData.employeeId}
                            onChange={handleEmployeeChange}
                            disabled={isFormDisabled || !formData.departmentId || fetchingEmployees}
                            required
                        >
                            <option value="">{fetchingEmployees ? 'Loading employees...' : 'Select Your Name'}</option>
                            {employees.map(emp => (
                                <option key={emp.employee_id} value={emp.employee_id}>
                                    {emp.employee_name} ({emp.employee_id})
                                </option>
                            ))}
                        </select>
                        {formData.employeeName && (
                            <div className="selected-employee">
                                Selected: <strong>{formData.employeeName}</strong> - {formData.departmentName}
                            </div>
                        )}
                        {alreadyCheckedIn && (
                            <div className="error-message">
                                ⚠️ You have already checked in today!
                            </div>
                        )}
                        {ipBlocked && (
                            <div className="warning-message">
                                📱 This device has already been used to check in today.
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label>Meeting Rating</label>
                        <div className="rating-container">
                            <div className="stars">
                                {renderStars()}
                            </div>
                            <div className="rating-text">
                                {formData.rating > 0 ? `You rated: ${formData.rating} star${formData.rating > 1 ? 's' : ''}` : 'Click to rate'}
                            </div>
                        </div>
                    </div>
                    
                    <div className="button-group">
                        <button 
                            type="submit" 
                            className={`submit-btn ${!timeStatus.isPunchInAllowed || timeError ? 'disabled-time' : ''}`}
                            disabled={isFormDisabled || !formData.employeeId}
                        >
                            {loading ? '🔄 Submitting...' : 
                             alreadyCheckedIn ? 'Already Checked In' :
                             ipBlocked ? 'Device Already Used' :
                             timeError ? 'Time Check Error' :
                             !timeStatus.isPunchInAllowed ? 'Time Exceeded' :
                             'Punch Attendance'}
                        </button>
                    </div>
                </form>
            </div>
            
            <div className="footer">
                <p>© 2023 Company Name. All rights reserved.</p>
                <p style={{fontSize: '10px', color: '#95a5a6', marginTop: '5px'}}>
                    Punch-in allowed: 09:00 AM - 09:45 AM IST (Server Time)
                </p>
            </div>
        </div>
    );
};

export default EmployeeCheckIn;