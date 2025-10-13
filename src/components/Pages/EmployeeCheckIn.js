import React, { useState, useEffect } from 'react';
import './EmployeeCheckIn.css';

const API_BASE_URL = 'http://172.51.21.104:5000';

// Office coordinates (replace with your actual office coordinates)
const OFFICE_LATITUDE = 12.990461; // Example: Chennai coordinates
const OFFICE_LONGITUDE = 80.220037;
const ALLOWED_RADIUS_METERS = 200; // 800 meters radius

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
    const [locationStatus, setLocationStatus] = useState({
        isWithinOffice: false,
        message: 'Checking location...',
        distance: null,
        error: null,
        permissionGranted: null
    });
    const [gettingLocation, setGettingLocation] = useState(false);
    const [showLocationGuide, setShowLocationGuide] = useState(false);

    // Calculate distance between two coordinates using Haversine formula
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distance in meters
    };

    // Check if geolocation is supported
    const isGeolocationSupported = () => {
        return !!navigator.geolocation;
    };

    // Get user's current location with better error handling
    const getUserLocation = () => {
        return new Promise((resolve, reject) => {
            if (!isGeolocationSupported()) {
                const error = new Error('Geolocation is not supported by this browser');
                setLocationStatus({
                    isWithinOffice: false,
                    message: 'Browser does not support location services',
                    distance: null,
                    error: error.message,
                    permissionGranted: false
                });
                reject(error);
                return;
            }

            setGettingLocation(true);
            setLocationStatus(prev => ({
                ...prev,
                message: 'Getting your location...',
                error: null
            }));
            
            const options = {
                enableHighAccuracy: true,
                timeout: 15000, // Increased timeout
                maximumAge: 60000
            };

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setGettingLocation(false);
                    const userLat = position.coords.latitude;
                    const userLon = position.coords.longitude;
                    const accuracy = position.coords.accuracy;
                    
                    console.log(`📍 Location acquired - Lat: ${userLat}, Lon: ${userLon}, Accuracy: ${accuracy}m`);
                    
                    // Calculate distance from office
                    const distance = calculateDistance(
                        userLat, 
                        userLon, 
                        OFFICE_LATITUDE, 
                        OFFICE_LONGITUDE
                    );
                    
                    const isWithinRadius = distance <= ALLOWED_RADIUS_METERS;
                    
                    setLocationStatus({
                        isWithinOffice: isWithinRadius,
                        message: isWithinRadius 
                            ? `You are within office premises (${Math.round(distance)}m away)` 
                            : `You are outside office radius (${Math.round(distance)}m away)`,
                        distance: Math.round(distance),
                        error: null,
                        permissionGranted: true
                    });
                    
                    resolve({
                        latitude: userLat,
                        longitude: userLon,
                        distance: distance,
                        isWithinRadius: isWithinRadius,
                        accuracy: accuracy
                    });
                },
                (error) => {
                    setGettingLocation(false);
                    let errorMessage = 'Unable to get your location';
                    let permissionGranted = false;
                    
                    switch (error.code) {
                        case error.PERMISSION_DENIED:
                            errorMessage = 'Location access denied. Please enable location services in your browser settings.';
                            permissionGranted = false;
                            setShowLocationGuide(true);
                            break;
                        case error.POSITION_UNAVAILABLE:
                            errorMessage = 'Location information unavailable. Please check your device location settings.';
                            permissionGranted = null;
                            break;
                        case error.TIMEOUT:
                            errorMessage = 'Location request timed out. Please try again.';
                            permissionGranted = null;
                            break;
                        default:
                            errorMessage = 'An unknown error occurred while getting location.';
                            permissionGranted = null;
                            break;
                    }
                    
                    setLocationStatus({
                        isWithinOffice: false,
                        message: errorMessage,
                        distance: null,
                        error: errorMessage,
                        permissionGranted: permissionGranted
                    });
                    
                    reject(new Error(errorMessage));
                },
                options
            );
        });
    };

    // Request location permission
    const requestLocationPermission = () => {
        setShowLocationGuide(true);
        setLocationStatus(prev => ({
            ...prev,
            message: 'Please enable location permissions in your browser...'
        }));
    };

    // Retry location with guidance
    const retryLocation = async () => {
        setShowLocationGuide(false);
        try {
            await getUserLocation();
        } catch (error) {
            // Error already handled in getUserLocation
        }
    };

    // Fetch departments and time status on component mount
    useEffect(() => {
        fetchDepartments();
        checkTimeStatus();
        
        // Check if geolocation is supported and try to get location
        if (isGeolocationSupported()) {
            getUserLocation().catch(() => {
                // Error handled in the function
            });
        }
        
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

        // Check if location permission was denied
        if (locationStatus.permissionGranted === false) {
            alert('❌ Location access is required for check-in. Please enable location permissions and try again.');
            setShowLocationGuide(true);
            return;
        }

        // Check if location services are not supported
        if (!isGeolocationSupported()) {
            alert('❌ Your browser does not support location services. Please use a modern browser with location support.');
            return;
        }

        // Get user location before submitting
        try {
            const locationData = await getUserLocation();
            
            if (!locationData.isWithinRadius) {
                alert(`❌ Location Restricted: You are ${locationData.distance}m away from office. Only employees within ${ALLOWED_RADIUS_METERS}m radius can check in.`);
                return;
            }
            
            // Proceed with submission if within radius
            await submitAttendance(locationData);
            
        } catch (error) {
            if (error.message.includes('denied')) {
                alert(`❌ Location access denied. Please enable location permissions to check in.`);
                setShowLocationGuide(true);
            } else {
                alert(`❌ Location Error: ${error.message}. Cannot proceed with check-in.`);
            }
            return;
        }
    };

    const submitAttendance = async (locationData) => {
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
                    rating: formData.rating,
                    location: {
                        latitude: locationData.latitude,
                        longitude: locationData.longitude,
                        distance: locationData.distance
                    }
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
                } else if (result.message.includes('outside office radius')) {
                    // Handle location-based rejection from server
                    setLocationStatus(prev => ({
                        ...prev,
                        isWithinOffice: false,
                        message: `Location restricted: ${result.message}`
                    }));
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

    const isFormDisabled = loading || alreadyCheckedIn || ipBlocked || !timeStatus.isPunchInAllowed || timeError || gettingLocation;

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

                {/* Location Status Banner */}
                <div className={`location-status-banner ${locationStatus.error ? 'error' : locationStatus.isWithinOffice ? 'allowed' : 'not-allowed'}`}>
                    <div className="location-status-icon">
                        {gettingLocation ? '📍' : locationStatus.error ? '⚠️' : locationStatus.isWithinOffice ? '🟢' : '🔴'}
                    </div>
                    <div className="location-status-content">
                        <div className="location-status-message">
                            {gettingLocation ? 'Getting your location...' : locationStatus.message}
                        </div>
                        {locationStatus.distance !== null && (
                            <div className="location-status-details">
                                Distance from office: {locationStatus.distance}m (Allowed: {ALLOWED_RADIUS_METERS}m)
                            </div>
                        )}
                    </div>
                    <button 
                        className="refresh-location-btn"
                        onClick={retryLocation}
                        title="Refresh location"
                        disabled={gettingLocation}
                    >
                        {gettingLocation ? '🔄' : '📍'}
                    </button>
                </div>

                {/* Location Guide Modal */}
                {showLocationGuide && (
                    <div className="location-guide-modal">
                        <div className="location-guide-content">
                            <h3>📍 Enable Location Access</h3>
                            <p>To check in, you need to enable location permissions:</p>
                            
                            <div className="browser-steps">
                                <h4>Chrome/Edge:</h4>
                                <ol>
                                    <li>Click the lock icon (🔒) in address bar</li>
                                    <li>Change "Location" to "Allow"</li>
                                    <li>Refresh the page and try again</li>
                                </ol>
                                
                                <h4>Firefox:</h4>
                                <ol>
                                    <li>Click the lock icon in address bar</li>
                                    <li>Click "Connection secure" → "More Information"</li>
                                    <li>Go to Permissions tab → Set "Location" to "Allow"</li>
                                </ol>
                                
                                <h4>Safari:</h4>
                                <ol>
                                    <li>Go to Safari → Preferences → Websites</li>
                                    <li>Select "Location" and allow this website</li>
                                </ol>
                            </div>
                            
                            <div className="location-guide-actions">
                                <button 
                                    className="guide-retry-btn"
                                    onClick={retryLocation}
                                >
                                    🔄 Try Again
                                </button>
                                <button 
                                    className="guide-close-btn"
                                    onClick={() => setShowLocationGuide(false)}
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
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
                        {alreadyCheckedIn && (
                            <div className="error-message">
                                ⚠️ You have already checked in today!
                            </div>
                        )}
                        {ipBlocked && (
                            <div className="warning-message">
                                📱 "Device already used for check-in today".
                            </div>
                        )}
                    </div>

                    <div className="form-group">
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
                            className={`submit-btn ${!timeStatus.isPunchInAllowed || timeError || !locationStatus.isWithinOffice ? 'disabled-time' : ''}`}
                            disabled={isFormDisabled || !formData.employeeId || !locationStatus.isWithinOffice}
                        >
                            {gettingLocation ? '📍 Getting Location...' :
                             loading ? '🔄 Submitting...' : 
                             alreadyCheckedIn ? 'Already Checked In' :
                             ipBlocked ? 'Device Already Used' :
                             timeError ? 'Time Check Error' :
                             !timeStatus.isPunchInAllowed ? 'Time Exceeded' :
                             !locationStatus.isWithinOffice ? 'Outside Office Area' :
                             'Submit'}
                        </button>
                    </div>
                </form>
            </div>
            
            <div className="footer">
                <p>© 2025 Rane Madras Limited. All rights reserved.</p>
                <p style={{fontSize: '10px', color: '#95a5a6', marginTop: '5px'}}>
                    Punch-in allowed: 09:00 AM - 09:45 AM IST (Server Time) | 
                    Location: Within {ALLOWED_RADIUS_METERS}m of office
                </p>
            </div>
        </div>
    );
};

export default EmployeeCheckIn;
