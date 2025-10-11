const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Log environment variables
console.log('=== Environment Variables ===');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('=============================');

// CORS configuration
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Function to get client IP address
const getClientIP = (req) => {
    return req.ip || req.connection.remoteAddress || 'Unknown';
};

// Request logging middleware
app.use((req, res, next) => {
    const clientIP = getClientIP(req);
    console.log(`${new Date().toLocaleString()} - ${req.method} ${req.url} - IP: ${clientIP}`);
    next();
});

const sql = require('mssql');

// SQL Server configuration
const dbConfig = {
  server: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, // You'll need to add this to .env
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT) || 1433,
  options: {
    enableArithAbort: true,
    trustServerCertificate: true, // Important for local development
    instanceName: 'SQLEXPRESS' // Specify the instance name
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

async function connectDB() {
  try {
    await sql.connect(dbConfig);
    console.log('✅ Connected to SQL Server successfully!');
    
    // Test the connection
    const result = await sql.query`SELECT @@VERSION as version`;
    console.log('📊 SQL Server Version:', result.recordset[0].version);
    
  } catch (err) {
    console.error('❌ SQL Server connection failed:', err.message);
    console.log('💡 Troubleshooting tips:');
    console.log('   1. Ensure SQL Server (SQLEXPRESS) is running');
    console.log('   2. Check if SQL Server Authentication is enabled');
    console.log('   3. Verify the sa password in .env file');
    console.log('   4. Check SQL Server Configuration Manager for TCP/IP status');
  }
}

// Call this function when your server starts
connectDB();

// Create tables function
async function createTables() {
    let connection;
    try {
        connection = await promisePool.getConnection();
        console.log('📊 Creating tables...');

        // Create Departments table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS Departments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                department_name VARCHAR(50) NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB
        `);
        console.log('✅ Departments table created/verified');

        // Create Employees table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS Employees (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employee_id VARCHAR(20) NOT NULL UNIQUE,
                employee_name VARCHAR(100) NOT NULL,
                department_id INT NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (department_id) REFERENCES Departments(id) ON DELETE CASCADE
            ) ENGINE=InnoDB
        `);
        console.log('✅ Employees table created/verified');

        // Create Attendance table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS Attendance (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employee_id VARCHAR(20) NOT NULL,
                employee_name VARCHAR(100) NOT NULL,
                department VARCHAR(50) NOT NULL,
                rating INT NOT NULL,
                ip_address VARCHAR(45) NOT NULL,
                user_latitude DECIMAL(10, 8),
                user_longitude DECIMAL(10, 8),
                check_in_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                check_in_date DATE DEFAULT (CURRENT_DATE),
                INDEX idx_employee_date (employee_id, check_in_date),
                INDEX idx_ip_date (ip_address, check_in_date)
            ) ENGINE=InnoDB
        `);
        console.log('✅ Attendance table created/verified');

        await insertSampleData(connection);
        console.log('🎉 Database setup completed successfully!');
        
    } catch (err) {
        console.error('❌ Error creating tables:', err.message);
        console.error('Full error:', err);
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

// Insert sample data
async function insertSampleData(connection) {
    try {
        // Check and insert departments
        const [deptRows] = await connection.execute('SELECT COUNT(*) as count FROM Departments');
        if (deptRows[0].count === 0) {
            await connection.execute(`
                INSERT INTO Departments (department_name) VALUES 
                ('Human Resources'), 
                ('Information Technology'), 
                ('Finance'),
                ('Marketing'), 
                ('Operations'), 
                ('Sales')
            `);
            console.log('✅ Sample departments inserted');
        } else {
            console.log('📁 Departments already exist, skipping insertion');
        }

        // Check and insert employees
        const [empRows] = await connection.execute('SELECT COUNT(*) as count FROM Employees');
        if (empRows[0].count === 0) {
            await connection.execute(`
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
            `);
            console.log('✅ Sample employees inserted');
        } else {
            console.log('👥 Employees already exist, skipping insertion');
        }
    } catch (err) {
        console.error('Error inserting sample data:', err);
    }
}

// API Routes

// Get all departments
app.get('/api/departments', async (req, res) => {
    let connection;
    try {
        connection = await promisePool.getConnection();
        const [rows] = await connection.execute('SELECT id, department_name FROM Departments ORDER BY department_name');
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Error fetching departments:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch departments' });
    } finally {
        if (connection) connection.release();
    }
});

// Get employees by department
app.get('/api/employees/:departmentId', async (req, res) => {
    let connection;
    try {
        const { departmentId } = req.params;
        connection = await promisePool.getConnection();
        const [rows] = await connection.execute(
            `SELECT e.employee_id, e.employee_name, d.department_name
             FROM Employees e
             INNER JOIN Departments d ON e.department_id = d.id
             WHERE e.department_id = ? AND e.is_active = TRUE
             ORDER BY e.employee_name`,
            [departmentId]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Error fetching employees:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch employees' });
    } finally {
        if (connection) connection.release();
    }
});

// Check if employee already checked in today
async function hasEmployeeCheckedInToday(employeeId) {
    let connection;
    try {
        connection = await promisePool.getConnection();
        const [rows] = await connection.execute(
            'SELECT COUNT(*) as checkInCount FROM Attendance WHERE employee_id = ? AND check_in_date = CURDATE()',
            [employeeId]
        );
        return rows[0].checkInCount > 0;
    } catch (err) {
        console.error('Error checking duplicate attendance:', err);
        return false;
    } finally {
        if (connection) connection.release();
    }
}

// Check if IP address already checked in today
async function hasIPCheckedInToday(ipAddress) {
    let connection;
    try {
        connection = await promisePool.getConnection();
        const [rows] = await connection.execute(
            'SELECT COUNT(*) as checkInCount FROM Attendance WHERE ip_address = ? AND check_in_date = CURDATE()',
            [ipAddress]
        );
        return rows[0].checkInCount > 0;
    } catch (err) {
        console.error('Error checking IP duplicate:', err);
        return false;
    } finally {
        if (connection) connection.release();
    }
}

// Store attendance record
app.post('/api/attendance', async (req, res) => {
    let connection;
    try {
        const { employeeId, employeeName, departmentName, rating, location } = req.body;
        const clientIP = getClientIP(req);
        
        console.log(`📱 Attendance attempt - Employee: ${employeeName} (${employeeId}), Department: ${departmentName}`);

        if (!employeeId || !employeeName || !departmentName) {
            return res.status(400).json({ success: false, message: 'Employee selection is required' });
        }

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: 'Valid rating (1-5 stars) is required' });
        }

        connection = await promisePool.getConnection();

        // Check duplicates
        const employeeAlreadyCheckedIn = await hasEmployeeCheckedInToday(employeeId);
        if (employeeAlreadyCheckedIn) {
            return res.status(400).json({ 
                success: false, 
                message: `${employeeName} (${employeeId}) has already checked in today. Duplicate punch-in is not allowed.` 
            });
        }

        const ipAlreadyCheckedIn = await hasIPCheckedInToday(clientIP);
        if (ipAlreadyCheckedIn) {
            return res.status(400).json({ 
                success: false, 
                message: `This device has already been used to check in today. Each device can only check in once per day.` 
            });
        }

        // Insert attendance record
        await connection.execute(
            `INSERT INTO Attendance (employee_id, employee_name, department, rating, ip_address, user_latitude, user_longitude)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [employeeId, employeeName, departmentName, rating, clientIP, location?.latitude, location?.longitude]
        );
        
        console.log(`✅ Attendance recorded - Employee: ${employeeName} (${employeeId})`);
        
        res.json({ 
            success: true, 
            message: 'Attendance recorded successfully',
            data: { employeeId, employeeName, departmentName, rating, checkInTime: new Date().toISOString() }
        });
    } catch (err) {
        console.error('Error recording attendance:', err);
        res.status(500).json({ success: false, message: 'Failed to record attendance: ' + err.message });
    } finally {
        if (connection) connection.release();
    }
});

// Get today's attendance
app.get('/api/attendance/today', async (req, res) => {
    let connection;
    try {
        connection = await promisePool.getConnection();
        const [rows] = await connection.execute(
            `SELECT id, employee_id, employee_name, department, rating, ip_address, check_in_time
             FROM Attendance WHERE check_in_date = CURDATE() ORDER BY check_in_time DESC`
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Error fetching attendance:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch attendance' });
    } finally {
        if (connection) connection.release();
    }
});

// Health check
app.get('/api/health', async (req, res) => {
    let connection;
    try {
        connection = await promisePool.getConnection();
        await connection.execute('SELECT 1');
        res.json({ 
            success: true, 
            message: 'Server is running with MySQL',
            timestamp: new Date().toISOString(),
            database: 'Connected'
        });
    } catch (err) {
        res.json({ 
            success: false, 
            message: 'Server running but database disconnected',
            timestamp: new Date().toISOString(),
            database: 'Disconnected'
        });
    } finally {
        if (connection) connection.release();
    }
});

// Test endpoint to check tables
app.get('/api/debug/tables', async (req, res) => {
    let connection;
    try {
        connection = await promisePool.getConnection();
        const [tables] = await connection.execute(`
            SELECT TABLE_NAME 
            FROM information_schema.tables 
            WHERE table_schema = ?
        `, [dbConfig.database]);
        
        const tableNames = tables.map(table => table.TABLE_NAME);
        
        res.json({ 
            success: true, 
            database: dbConfig.database,
            tables: tableNames,
            tableCount: tables.length
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error checking tables: ' + err.message });
    } finally {
        if (connection) connection.release();
    }
});

// Initialize server
async function startServer() {
    await initializeDatabase();
    app.listen(PORT, () => {
        console.log('\n🚀 Server running on port', PORT);
        console.log('📍 Local URL: http://localhost:' + PORT);
        console.log('📊 Health check: http://localhost:' + PORT + '/api/health');
        console.log('🔍 Debug tables: http://localhost:' + PORT + '/api/debug/tables');
        console.log('💾 Database: MySQL (Local)');
    });
}

startServer();