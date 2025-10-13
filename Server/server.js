const express = require('express');
const cors = require('cors');
const sql = require('mssql');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

const os = require('os');

// Office coordinates for geo-fencing (replace with your actual office coordinates)
const OFFICE_LATITUDE = 12.990402;
const OFFICE_LONGITUDE = 80.219971;
const ALLOWED_RADIUS_METERS = 100; // 100 meters radius

function getNetworkIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      if (interface.family === 'IPv4' && !interface.internal) {
        return interface.address;
      }
    }
  }
  return 'localhost';
}

const networkIP = getNetworkIP();

app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Function to get client IP address
const getClientIP = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const ips = forwarded.split(',');
        return ips[0].trim();
    }
    
    const realIP = req.headers['x-real-ip'];
    if (realIP) return realIP;
    
    const clientIP = req.headers['x-client-ip'];
    if (clientIP) return clientIP;
    
    const cfConnectingIP = req.headers['cf-connecting-ip'];
    if (cfConnectingIP) return cfConnectingIP;
    
    return req.connection.remoteAddress || 
           req.socket.remoteAddress || 
           req.connection.socket?.remoteAddress || 
           'Unknown';
};

// Function to calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
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
}

// Function to check if location is within office radius
function isWithinOfficeRadius(userLat, userLon) {
    const distance = calculateDistance(userLat, userLon, OFFICE_LATITUDE, OFFICE_LONGITUDE);
    return {
        isWithinRadius: distance <= ALLOWED_RADIUS_METERS,
        distance: Math.round(distance)
    };
}

// Request logging middleware with IP
app.use((req, res, next) => {
    const clientIP = getClientIP(req);
    console.log(`${new Date().toISOString()} - IP: ${clientIP} - ${req.method} ${req.url}`);
    next();
});

// Function to get current time in IST (India Standard Time)
function getCurrentISTTime() {
    const now = new Date();
    
    // Convert to IST (UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
    const istTime = new Date(now.getTime() + istOffset);
    
    return {
        hour: istTime.getUTCHours(),
        minute: istTime.getUTCMinutes(),
        second: istTime.getUTCSeconds(),
        formatted: istTime.toISOString().substr(11, 8),
        fullDate: istTime.toISOString()
    };
}

// Function to check if current time is within allowed punch-in time (09:00 to 09:45 IST)
function isWithinPunchInTime() {
    const istTime = getCurrentISTTime();
    const currentHour = istTime.hour;
    const currentMinute = istTime.minute;
    
    // Allow punch-in only between 09:00 and 09:45 IST
    const isWithinTime = (currentHour === 9 && currentMinute >= 0 && currentMinute <= 45);
    
    console.log(`🕒 IST Time: ${istTime.formatted}, Within allowed time: ${isWithinTime}`);
    return isWithinTime;
}

// Function to get current time status message
function getTimeStatusMessage() {
    const istTime = getCurrentISTTime();
    const currentHour = istTime.hour;
    const currentMinute = istTime.minute;
    
    if (currentHour < 9) {
        return `Punch-in will open at 09:00 AM IST. Current time: ${istTime.formatted}`;
    } else if (currentHour === 9 && currentMinute <= 45) {
        return `Punch-in allowed until 09:45 AM IST. Current time: ${istTime.formatted}`;
    } else {
        return `Punch-in time exceeded. Allowed only between 09:00-09:45 AM IST. Current time: ${istTime.formatted}`;
    }
}

// SQL Server configuration
const dbConfig = {
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT),
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

let pool;

// Initialize database connection
async function initializeDatabase() {
    try {
        console.log('Attempting to connect to SQL Server...');
        pool = await sql.connect(dbConfig);
        console.log('✅ Connected to SQL Server successfully!');
        
        await verifyTableStructure();
        
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
    }
}

// Verify and fix table structure
async function verifyTableStructure() {
    try {
        // Check current table structure
        const tableStructure = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Attendance'
            ORDER BY ORDINAL_POSITION
        `);
        
        console.log('📊 Current Attendance table structure:');
        tableStructure.recordset.forEach(col => {
            console.log(`   - ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
        });

        // Add missing columns if needed
        const columns = tableStructure.recordset.map(col => col.COLUMN_NAME);
        
        if (!columns.includes('employee_id')) {
            await pool.request().query(`ALTER TABLE Attendance ADD employee_id NVARCHAR(20) NULL`);
            console.log('✅ Added employee_id column');
        }
        
        if (!columns.includes('department')) {
            await pool.request().query(`ALTER TABLE Attendance ADD department NVARCHAR(50) NULL`);
            console.log('✅ Added department column');
        }
        
        if (!columns.includes('rating')) {
            await pool.request().query(`ALTER TABLE Attendance ADD rating INT NOT NULL DEFAULT 0`);
            console.log('✅ Added rating column');
        }
        
        if (!columns.includes('ip_address')) {
            await pool.request().query(`ALTER TABLE Attendance ADD ip_address NVARCHAR(45) NULL`);
            console.log('✅ Added ip_address column');
        }

        // Add location columns for geo-fencing
        if (!columns.includes('latitude')) {
            await pool.request().query(`ALTER TABLE Attendance ADD latitude DECIMAL(10, 8) NULL`);
            console.log('✅ Added latitude column');
        }
        
        if (!columns.includes('longitude')) {
            await pool.request().query(`ALTER TABLE Attendance ADD longitude DECIMAL(11, 8) NULL`);
            console.log('✅ Added longitude column');
        }
        
        if (!columns.includes('distance_from_office')) {
            await pool.request().query(`ALTER TABLE Attendance ADD distance_from_office INT NULL`);
            console.log('✅ Added distance_from_office column');
        }

        // Create other tables if they don't exist
        await createSupportingTables();
        
    } catch (err) {
        console.error('Error verifying table structure:', err);
    }
}

// Create supporting tables
async function createSupportingTables() {
    try {
        // Create Departments table if not exists
        const deptTableCheck = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Departments' AND xtype='U')
            CREATE TABLE Departments (
                id INT IDENTITY(1,1) PRIMARY KEY,
                department_name NVARCHAR(50) NOT NULL UNIQUE,
                created_at DATETIME2 DEFAULT GETDATE()
            )
        `;
        await pool.request().query(deptTableCheck);

        // Create Employees table if not exists
        const empTableCheck = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Employees' AND xtype='U')
            CREATE TABLE Employees (
                id INT IDENTITY(1,1) PRIMARY KEY,
                employee_id NVARCHAR(20) NOT NULL UNIQUE,
                employee_name NVARCHAR(100) NOT NULL,
                department_id INT NOT NULL,
                is_active BIT DEFAULT 1,
                created_at DATETIME2 DEFAULT GETDATE(),
                FOREIGN KEY (department_id) REFERENCES Departments(id)
            )
        `;
        await pool.request().query(empTableCheck);

        // Insert sample data if tables are empty
        await insertSampleData();
        
        console.log('✅ All supporting tables are ready');
    } catch (err) {
        console.error('Error creating supporting tables:', err);
    }
}

// Insert sample data
async function insertSampleData() {
    try {
        // Check if departments table is empty
        const deptCount = await pool.request().query('SELECT COUNT(*) as count FROM Departments');
        if (deptCount.recordset[0].count === 0) {
            const insertDepts = `
                INSERT INTO Departments (department_name) VALUES 
                ('Human Resources'),
                ('Information Technology'),
                ('Finance'),
                ('Marketing'),
                ('Operations'),
                ('Sales')
            `;
            await pool.request().query(insertDepts);
            console.log('✅ Sample departments inserted');
        }

        // Check if employees table is empty
        const empCount = await pool.request().query('SELECT COUNT(*) as count FROM Employees');
        if (empCount.recordset[0].count === 0) {
            const insertEmps = `
                INSERT INTO Employees (employee_id, employee_name, department_id) VALUES
                ('HR001', 'John Smith', 1),
                ('HR002', 'Sarah Johnson', 1),
                ('IT001', 'Mike Davis', 2),
                ('IT002', 'Emily Chen', 2),
                ('IT003', 'David Wilson', 2),
                ('FIN001', 'Lisa Brown', 3),
                ('FIN002', 'Robert Taylor', 3),
                ('MKT001', 'Jennifer Lee', 4),
                ('OPS001', 'James Miller', 5),
                ('SAL001', 'Patricia Moore', 6)
            `;
            await pool.request().query(insertEmps);
            console.log('✅ Sample employees inserted');
        }
    } catch (err) {
        console.error('Error inserting sample data:', err);
    }
}

// Get all departments
app.get('/api/departments', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ 
                success: false, 
                message: 'Database not available' 
            });
        }

        const query = `
            SELECT id, department_name 
            FROM Departments 
            ORDER BY department_name
        `;
        
        const result = await pool.request().query(query);
        res.json({ 
            success: true, 
            data: result.recordset 
        });
    } catch (err) {
        console.error('Error fetching departments:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch departments' 
        });
    }
});

// Get employees by department
app.get('/api/employees/:departmentId', async (req, res) => {
    try {
        const { departmentId } = req.params;
        
        if (!pool) {
            return res.status(500).json({ 
                success: false, 
                message: 'Database not available' 
            });
        }

        const query = `
            SELECT e.employee_id, e.employee_name, d.department_name
            FROM Employees e
            INNER JOIN Departments d ON e.department_id = d.id
            WHERE e.department_id = @departmentId AND e.is_active = 1
            ORDER BY e.employee_name
        `;
        
        const request = pool.request();
        request.input('departmentId', sql.Int, departmentId);
        
        const result = await request.query(query);
        res.json({ 
            success: true, 
            data: result.recordset 
        });
    } catch (err) {
        console.error('Error fetching employees:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch employees' 
        });
    }
});

// Check if employee already checked in today
async function hasEmployeeCheckedInToday(employeeId) {
    try {
        const query = `
            SELECT COUNT(*) as checkInCount 
            FROM Attendance 
            WHERE employee_id = @employeeId 
            AND check_in_date = CAST(GETDATE() AS DATE)
        `;
        
        const request = pool.request();
        request.input('employeeId', sql.NVarChar(20), employeeId);
        
        const result = await request.query(query);
        return result.recordset[0].checkInCount > 0;
    } catch (err) {
        console.error('Error checking duplicate attendance:', err);
        return false;
    }
}

// Check if IP address already checked in today
async function hasIPCheckedInToday(ipAddress) {
    try {
        const query = `
            SELECT COUNT(*) as checkInCount 
            FROM Attendance 
            WHERE ip_address = @ipAddress 
            AND check_in_date = CAST(GETDATE() AS DATE)
        `;
        
        const request = pool.request();
        request.input('ipAddress', sql.NVarChar(45), ipAddress);
        
        const result = await request.query(query);
        return result.recordset[0].checkInCount > 0;
    } catch (err) {
        console.error('Error checking IP duplicate:', err);
        return false;
    }
}

// Store attendance record with time restriction and geo-fencing
app.post('/api/attendance', async (req, res) => {
    try {
        const { employeeId, employeeName, departmentName, rating, location } = req.body;
        const clientIP = getClientIP(req);
        
        console.log(`📱 Attendance attempt - Employee: ${employeeName} (${employeeId}), Department: ${departmentName}, IP: ${clientIP}`);
        
        // Add location logging and validation
        if (location) {
            console.log(`📍 User location: ${location.latitude}, ${location.longitude}, Distance: ${location.distance}m`);
            
            // Validate location on server side as well
            const locationCheck = isWithinOfficeRadius(location.latitude, location.longitude);
            if (!locationCheck.isWithinRadius) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Location restricted: You are ${locationCheck.distance}m away from office. Only employees within ${ALLOWED_RADIUS_METERS}m radius can check in.` 
                });
            }
        } else {
            return res.status(400).json({ 
                success: false, 
                message: 'Location data is required for check-in. Please enable location services.' 
            });
        }

        // Check if within allowed punch-in time
        if (!isWithinPunchInTime()) {
            const timeMessage = getTimeStatusMessage();
            return res.status(400).json({ 
                success: false, 
                message: `Punch-in not allowed. ${timeMessage}` 
            });
        }
        
        if (!employeeId || !employeeName || !departmentName) {
            return res.status(400).json({ 
                success: false, 
                message: 'Employee selection is required' 
            });
        }

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ 
                success: false, 
                message: 'Valid rating (1-5 stars) is required' 
            });
        }

        if (!pool) {
            return res.status(500).json({ 
                success: false, 
                message: 'Database not available. Please try again later.' 
            });
        }

        // Check if employee already checked in today
        const employeeAlreadyCheckedIn = await hasEmployeeCheckedInToday(employeeId);
        if (employeeAlreadyCheckedIn) {
            return res.status(400).json({ 
                success: false, 
                message: `${employeeName} (${employeeId}) has already checked in today. Duplicate punch-in is not allowed.` 
            });
        }

        // Check if IP address already checked in today
        const ipAlreadyCheckedIn = await hasIPCheckedInToday(clientIP);
        if (ipAlreadyCheckedIn) {
            return res.status(400).json({ 
                success: false, 
                message: `This device (IP: ${clientIP}) has already been used to check in today. Each device can only check in once per day.` 
            });
        }

        // Updated query to include location data
        const query = `
            INSERT INTO Attendance (employee_id, employee_name, department, rating, ip_address, check_in_time, check_in_date, latitude, longitude, distance_from_office)
            VALUES (@employeeId, @employeeName, @departmentName, @rating, @ipAddress, GETDATE(), CAST(GETDATE() AS DATE), @latitude, @longitude, @distance)
        `;

        const request = pool.request();
        request.input('employeeId', sql.NVarChar(20), employeeId);
        request.input('employeeName', sql.NVarChar(100), employeeName);
        request.input('departmentName', sql.NVarChar(50), departmentName);
        request.input('rating', sql.Int, rating);
        request.input('ipAddress', sql.NVarChar(45), clientIP);
        request.input('latitude', sql.Decimal(10, 8), location.latitude);
        request.input('longitude', sql.Decimal(11, 8), location.longitude);
        request.input('distance', sql.Int, Math.round(location.distance));

        await request.query(query);
        
        console.log(`✅ Attendance recorded - Employee: ${employeeName} (${employeeId}), Department: ${departmentName}, IP: ${clientIP}, Distance: ${Math.round(location.distance)}m`);
        
        res.json({ 
            success: true, 
            message: 'Attendance and rating recorded successfully',
            data: {
                employeeId,
                employeeName,
                departmentName,
                rating,
                ipAddress: clientIP,
                location: {
                    latitude: location.latitude,
                    longitude: location.longitude,
                    distance: location.distance
                },
                checkInTime: new Date().toISOString()
            }
        });
    } catch (err) {
        console.error('Error recording attendance:', err);
        
        // Provide more specific error messages
        if (err.message && err.message.includes('invalid column name')) {
            console.error('Database column mismatch. Current table structure:');
            const tableStructure = await pool.request().query(`
                SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'Attendance'
            `);
            console.table(tableStructure.recordset);
            
            return res.status(500).json({ 
                success: false, 
                message: 'Database configuration error. Please contact administrator.' 
            });
        }
        
        if (err.message && (err.message.includes('unique') || err.message.includes('duplicate'))) {
            return res.status(400).json({ 
                success: false, 
                message: 'Duplicate check-in detected. Each device can only check in once per day.' 
            });
        }
        
        res.status(500).json({ 
            success: false, 
            message: 'Failed to record attendance: ' + err.message 
        });
    }
});

// Get current time status
app.get('/api/time-status', (req, res) => {
    try {
        const isAllowed = isWithinPunchInTime();
        const message = getTimeStatusMessage();
        const istTime = getCurrentISTTime();
        
        res.json({
            success: true,
            data: {
                isPunchInAllowed: isAllowed,
                message: message,
                currentTime: istTime.formatted,
                serverTime: new Date().toISOString(),
                timezone: 'IST (UTC+5:30)'
            }
        });
    } catch (error) {
        console.error('Error in time-status endpoint:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking time status'
        });
    }
});

// Get today's attendance
app.get('/api/attendance/today', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ 
                success: false, 
                message: 'Database not available' 
            });
        }

        const query = `
            SELECT id, employee_id, employee_name, department, rating, ip_address, check_in_time, latitude, longitude, distance_from_office
            FROM Attendance 
            WHERE check_in_date = CAST(GETDATE() AS DATE)
            ORDER BY check_in_time DESC
        `;
        
        const result = await pool.request().query(query);
        res.json({ 
            success: true, 
            data: result.recordset 
        });
    } catch (err) {
        console.error('Error fetching today\'s attendance:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch today\'s attendance' 
        });
    }
});

// Health check with time status and location info
app.get('/api/health', (req, res) => {
    const dbStatus = pool ? 'connected' : 'disconnected';
    const clientIP = getClientIP(req);
    const isPunchInAllowed = isWithinPunchInTime();
    const timeMessage = getTimeStatusMessage();
    const istTime = getCurrentISTTime();
    
    res.json({ 
        success: true, 
        message: 'Server is running',
        database: dbStatus,
        timestamp: new Date().toISOString(),
        clientIP: clientIP,
        punchInAllowed: isPunchInAllowed,
        timeStatus: timeMessage,
        istTime: istTime.formatted,
        timezone: 'IST',
        geoFencing: {
            enabled: true,
            officeLatitude: OFFICE_LATITUDE,
            officeLongitude: OFFICE_LONGITUDE,
            allowedRadius: ALLOWED_RADIUS_METERS
        }
    });
});

// Initialize server
async function startServer() {
    try {
        await initializeDatabase();
        app.listen(PORT, '0.0.0.0', () => {
            const istTime = getCurrentISTTime();
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📍 Access via: http://localhost:${PORT}`);
            console.log(`🕒 Current IST Time: ${istTime.formatted}`);
            console.log(`🕒 Punch-in allowed: 09:00 AM - 09:45 AM IST`);
            console.log(`📍 Geo-fencing: Enabled (${ALLOWED_RADIUS_METERS}m radius around office)`);
            console.log(`📍 Office coordinates: ${OFFICE_LATITUDE}, ${OFFICE_LONGITUDE}`);
            console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
            console.log(`🌐 Network: http://${networkIP}:${PORT}`);
            console.log(`⏰ Time status: http://localhost:${PORT}/api/time-status`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
    }
}

startServer();
