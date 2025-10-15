import React, { useState, useEffect } from 'react';
import './EmployeeCheckIn.css';
import supabase from '../services/auth'; 

const OFFICE_LATITUDE = 12.990461; // Example: Chennai coordinates
const OFFICE_LONGITUDE = 80.220037;
const ALLOWED_RADIUS_METERS = 200; // 200 meters radius
fetch('http://172.51.21.104:5000/api/departments')
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
    const [userIP, setUserIP] = useState(null);
    const [ipCheckLoading, setIpCheckLoading] = useState(true);
    const [ipRestrictionError, setIpRestrictionError] = useState(null);

    // Get user's IP address
    const getUserIP = async () => {
        try {
            setIpCheckLoading(true);
            // Try multiple IP detection services as fallback
            const services = [
                'https://api.ipify.org?format=json',
                'https://api64.ipify.org?format=json',
                'https://ipapi.co/json/'
            ];

            let ip = null;
            
            for (const service of services) {
                try {
                    const response = await fetch(service, {
                        method: 'GET',
                        timeout: 5000
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        ip = data.ip || (data.data && data.data.ip) || data.query;
                        if (ip) break;
                    }
                } catch (error) {
                    console.log(`IP service ${service} failed:`, error);
                    continue;
                }
            }

            if (!ip) {
                throw new Error('Could not retrieve IP address');
            }

            setUserIP(ip);
            return ip;
        } catch (error) {
            console.error('Error getting IP address:', error);
            setIpRestrictionError('Unable to verify device. Please check your internet connection.');
            return null;
        } finally {
            setIpCheckLoading(false);
        }
    };

    // Check if IP has already been used today
    const checkIPRestriction = async (ip) => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const { data, error } = await supabase
                .from('attendance')
                .select('employee_name, check_in_date')
                .eq('ip_address', ip)
                .eq('check_in_date', today)
                .maybeSingle();
            
            if (error) {
                console.error('Error checking IP restriction:', error);
                return { allowed: true, existingRecord: null }; // Allow on error
            }
            
            return { 
                allowed: !data, 
                existingRecord: data 
            };
        } catch (error) {
            console.error('Error checking IP restriction:', error);
            return { allowed: true, existingRecord: null }; // Allow on error
        }
    };

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

    // Check time status for punch-in window
    const checkTimeStatus = () => {
        const now = new Date();
        const currentTime = now.toLocaleTimeString('en-IN', { 
            timeZone: 'Asia/Kolkata',
            hour12: false 
        });
        
        // Convert to 24-hour format for comparison
        const [hours, minutes, seconds] = currentTime.split(':').map(Number);
        const totalMinutes = hours * 60 + minutes;
        
        // Punch-in allowed between 9:00 AM and 9:45 AM IST
        const punchInStart = 9 * 60; // 9:00 AM
        const punchInEnd = 9 * 60 + 45; // 9:45 AM
        
        const isPunchInAllowed = totalMinutes >= punchInStart && totalMinutes <= punchInEnd;
        
        setTimeStatus({
            isPunchInAllowed: isPunchInAllowed,
            message: isPunchInAllowed 
                ? 'Punch-in time: 09:00 AM - 09:45 AM IST' 
                : `Punch-in not allowed. Current time: ${currentTime}`,
            currentTime: currentTime,
            timezone: 'IST'
        });
    };

    // Fetch departments from Supabase
    const fetchDepartments = async () => {
        try {
            const { data, error } = await supabase
                .from('departments')
                .select('*')
                .order('department_name');
            
            if (error) {
                console.error('Error fetching departments:', error);
                return;
            }
            
            setDepartments(data || []);
        } catch (error) {
            console.error('Error fetching departments:', error);
        }
    };

    // Fetch employees by department from Supabase
    const fetchEmployeesByDepartment = async (departmentId) => {
        if (!departmentId) {
            setEmployees([]);
            return;
        }

        setFetchingEmployees(true);
        try {
            const { data, error } = await supabase
                .from('employees')
                .select('*')
                .eq('department_id', departmentId)
                .order('employee_name');
            
            if (error) {
                console.error('Error fetching employees:', error);
                setEmployees([]);
                return;
            }
            
            setEmployees(data || []);
        } catch (error) {
            console.error('Error fetching employees:', error);
            setEmployees([]);
        } finally {
            setFetchingEmployees(false);
        }
    };

    // Check if employee has already checked in today
    const checkExistingCheckIn = async (employeeId) => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const { data, error } = await supabase
                .from('attendance')
                .select('id')
                .eq('employee_id', employeeId)
                .eq('check_in_date', today)
                .maybeSingle();
            
            if (error) {
                console.error('Error checking existing check-in:', error);
                return false;
            }
            
            return !!data;
        } catch (error) {
            console.error('Error checking existing check-in:', error);
            return false;
        }
    };

    // Initialize IP and check restrictions
    const initializeIPCheck = async () => {
        const ip = await getUserIP();
        if (ip) {
            const { allowed, existingRecord } = await checkIPRestriction(ip);
            if (!allowed && existingRecord) {
                setIpRestrictionError(`This device has been checked-in today`);
            }
        }
    };

    useEffect(() => {
        fetchDepartments();
        checkTimeStatus();
        initializeIPCheck();
        
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

        if (departmentId) {
            fetchEmployeesByDepartment(departmentId);
        }
    };

    const handleEmployeeChange = async (e) => {
        const employeeId = e.target.value;
        const selectedEmployee = employees.find(emp => emp.employee_id === employeeId);
        
        if (selectedEmployee) {
            setFormData(prev => ({
                ...prev,
                employeeId: selectedEmployee.employee_id,
                employeeName: selectedEmployee.employee_name,
                departmentName: selectedEmployee.department_name
            }));

            // Check if employee has already checked in today
            const hasCheckedIn = await checkExistingCheckIn(selectedEmployee.employee_id);
            setAlreadyCheckedIn(hasCheckedIn);
        } else {
            setFormData(prev => ({
                ...prev,
                employeeId: '',
                employeeName: '',
                departmentName: prev.departmentName
            }));
            setAlreadyCheckedIn(false);
        }
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
        
        // Check IP restriction first
        if (ipRestrictionError) {
            alert(`❌ Device Restriction: ${ipRestrictionError}`);
            return;
        }

        if (!userIP && !ipCheckLoading) {
            alert('❌ Unable to verify your device. Please check your internet connection and try again.');
            return;
        }

        if (ipCheckLoading) {
            alert('⏳ Please wait while we verify your device...');
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

        if (alreadyCheckedIn) {
            alert('❌ You have already checked in today!');
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
                alert(`❌ Location Restricted: You are ${Math.round(locationData.distance)}m away from office. Only employees within ${ALLOWED_RADIUS_METERS}m radius can check in.`);
                return;
            }
            
            // Final IP restriction check before submission
            const { allowed, existingRecord } = await checkIPRestriction(userIP);
            if (!allowed) {
                setIpRestrictionError(`This device has already been used for check-in today by ${existingRecord.employee_name}. Only one check-in per device is allowed.`);
                alert(`❌ Device Restriction: ${ipRestrictionError}`);
                return;
            }
            
            // Proceed with submission if all checks pass
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
        
        try {
            const { data, error } = await supabase
                .from('attendance')
                .insert([
                    {
                        employee_id: formData.employeeId,
                        employee_name: formData.employeeName,
                        department_name: formData.departmentName,
                        rating: formData.rating,
                        latitude: locationData.latitude,
                        longitude: locationData.longitude,
                        distance: Math.round(locationData.distance),
                        ip_address: userIP // Store IP address for device tracking
                    }
                ])
                .select();
            
            if (error) {
                if (error.code === '23505') { // Unique violation (already checked in)
                    setAlreadyCheckedIn(true);
                    alert('❌ You have already checked in today!');
                } else {
                    console.error('Error submitting attendance:', error);
                    alert(`❌ Error: ${error.message}`);
                }
                return;
            }
            
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
            setAlreadyCheckedIn(false);
            
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

    const isFormDisabled = loading || alreadyCheckedIn || !timeStatus.isPunchInAllowed || gettingLocation || ipCheckLoading || ipRestrictionError;

    return (
        <div className="container">
            <div className="form-container">
                {/* IP/Device Status Banner */}
                <div className={`device-status-banner ${ipRestrictionError ? 'error' : ipCheckLoading ? 'loading' : 'allowed'}`}>
                    <div className="device-status-icon">
                        {ipRestrictionError ? '🚫' : ipCheckLoading ? '🔄' : '✅'}
                    </div>
                    <div className="device-status-content">
                        <div className="device-status-message">
                            {ipRestrictionError ? ipRestrictionError : 
                             ipCheckLoading ? 'Verifying device...' : 
                             'Device verified - Ready for check-in'}
                        </div>
                        {userIP && !ipRestrictionError && (
                            <div className="device-status-details">
                                Your IP: {userIP} | One check-in per device allowed
                            </div>
                        )}
                    </div>
                    {ipRestrictionError && (
                        <button 
                            className="refresh-ip-btn"
                            onClick={initializeIPCheck}
                            title="Retry device verification"
                        >
                            🔄
                        </button>
                    )}
                </div>

                {/* Time Status Banner */}
                <div className={`time-status-banner ${timeStatus.isPunchInAllowed ? 'allowed' : 'not-allowed'}`}>
                    <div className="time-status-icon">
                        {timeStatus.isPunchInAllowed ? '🟢' : '🔴'}
                    </div>
                    <div className="time-status-content">
                        <div className="time-status-message">
                            {timeStatus.message}
                        </div>
                        <div className="time-status-details">
                            Current Time: {timeStatus.currentTime} ({timeStatus.timezone})
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
                            className={`submit-btn ${!timeStatus.isPunchInAllowed || !locationStatus.isWithinOffice || ipRestrictionError ? 'disabled-time' : ''}`}
                            disabled={isFormDisabled || !formData.employeeId || !locationStatus.isWithinOffice || alreadyCheckedIn || ipRestrictionError}
                        >
                            {ipCheckLoading ? '🔒 Verifying Device...' :
                             gettingLocation ? '📍 Getting Location...' :
                             loading ? '🔄 Submitting...' : 
                             alreadyCheckedIn ? 'Already Checked In' :
                             ipRestrictionError ? 'Device Already Used' :
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
                    Punch-in allowed: 09:00 AM - 09:45 AM IST | 
                    Location: Within {ALLOWED_RADIUS_METERS}m of office |
                    Device: One check-in per device
                </p>
            </div>
        </div>
    );
};

export default EmployeeCheckIn;

