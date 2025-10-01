const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store latest ROS2 data
let latestROS2Data = {
  message: null,
  timestamp: null,
  node_name: null,
  message_count: 0
};

let messageHistory = [];
let ros2Process = null;

// ============= ROS2 LAUNCH/CONTROL =============

// Launch ROS2 nodes
app.post('/api/ros2/launch', (req, res) => {
  const { package_name, launch_file } = req.body;
  
  if (!package_name || !launch_file) {
    return res.status(400).json({ 
      error: 'package_name and launch_file required' 
    });
  }

  try {
    // Kill existing process if running
    if (ros2Process) {
      ros2Process.kill();
    }

    // Launch ROS2
    ros2Process = spawn('ros2', ['launch', package_name, launch_file], {
      cwd: process.env.HOME + '/ros2_ws'
    });

    let outputBuffer = '';

    ros2Process.stdout.on('data', (data) => {
      const output = data.toString();
      outputBuffer += output;
      console.log(`ROS2 OUTPUT: ${output}`);
      
      // Parse ROS2 log messages
      parseROS2Output(output);
    });

    ros2Process.stderr.on('data', (data) => {
      console.error(`ROS2 ERROR: ${data}`);
    });

    ros2Process.on('close', (code) => {
      console.log(`ROS2 process exited with code ${code}`);
      ros2Process = null;
    });

    res.json({ 
      success: true, 
      message: `Launched ${package_name}/${launch_file}`,
      pid: ros2Process.pid
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message 
    });
  }
});

// Stop ROS2 processes
app.post('/api/ros2/stop', (req, res) => {
  if (ros2Process) {
    ros2Process.kill('SIGINT');
    ros2Process = null;
    res.json({ success: true, message: 'ROS2 processes stopped' });
  } else {
    res.json({ success: false, message: 'No ROS2 process running' });
  }
});

// Run individual ROS2 node
app.post('/api/ros2/run-node', (req, res) => {
  const { package_name, node_name } = req.body;
  
  if (!package_name || !node_name) {
    return res.status(400).json({ 
      error: 'package_name and node_name required' 
    });
  }

  try {
    const nodeProcess = spawn('ros2', ['run', package_name, node_name], {
      cwd: process.env.HOME + '/ros2_ws'
    });

    nodeProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`NODE OUTPUT: ${output}`);
      parseROS2Output(output);
    });

    nodeProcess.stderr.on('data', (data) => {
      console.error(`NODE ERROR: ${data}`);
    });

    res.json({ 
      success: true, 
      message: `Started ${package_name}/${node_name}`,
      pid: nodeProcess.pid
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= ROS2 DATA PARSING =============

function parseROS2Output(output) {
  // Match ROS2 log format: [INFO] [timestamp] [node_name]: message
  const logRegex = /\[INFO\]\s+\[[\d.]+\]\s+\[([^\]]+)\]:\s+(.+)/g;
  let match;

  while ((match = logRegex.exec(output)) !== null) {
    const [, nodeName, message] = match;
    
    const dataPoint = {
      node_name: nodeName,
      message: message.trim(),
      timestamp: new Date().toISOString(),
      message_count: ++latestROS2Data.message_count
    };

    latestROS2Data = dataPoint;
    
    messageHistory.unshift(dataPoint);
    if (messageHistory.length > 100) {
      messageHistory.pop();
    }
  }
}

// ============= DATA ENDPOINTS =============

// Get latest ROS2 data
app.get('/api/ros2/data', (req, res) => {
  res.json(latestROS2Data);
});

// Get message history
app.get('/api/ros2/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(messageHistory.slice(0, limit));
});

// Get ROS2 status
app.get('/api/ros2/status', (req, res) => {
  res.json({
    is_running: ros2Process !== null,
    pid: ros2Process ? ros2Process.pid : null,
    message_count: latestROS2Data.message_count,
    last_message_time: latestROS2Data.timestamp
  });
});

// ============= ROS2 INFO COMMANDS =============

// List ROS2 nodes
app.get('/api/ros2/nodes', (req, res) => {
  const proc = spawn('ros2', ['node', 'list']);
  let output = '';

  proc.stdout.on('data', (data) => {
    output += data.toString();
  });

  proc.on('close', () => {
    const nodes = output.trim().split('\n').filter(n => n);
    res.json({ nodes });
  });
});

// List ROS2 topics
app.get('/api/ros2/topics', (req, res) => {
  const proc = spawn('ros2', ['topic', 'list']);
  let output = '';

  proc.stdout.on('data', (data) => {
    output += data.toString();
  });

  proc.on('close', () => {
    const topics = output.trim().split('\n').filter(t => t);
    res.json({ topics });
  });
});

// ============= UTILITY =============

app.get('/api/health', (req, res) => {
  res.json({
    status: 'running',
    ros2_active: ros2Process !== null,
    message_count: latestROS2Data.message_count,
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║  ROS2 Web Bridge Server                               ║
╠═══════════════════════════════════════════════════════╣
║  Server: http://localhost:${PORT}                      ║
║                                                       ║
║  Endpoints:                                           ║
║  POST /api/ros2/launch        - Launch ROS2 nodes    ║
║  POST /api/ros2/stop          - Stop ROS2 processes  ║
║  POST /api/ros2/run-node      - Run single node      ║
║  GET  /api/ros2/data          - Get latest data      ║
║  GET  /api/ros2/history       - Get message history  ║
║  GET  /api/ros2/status        - Get ROS2 status      ║
║  GET  /api/ros2/nodes         - List active nodes    ║
║  GET  /api/ros2/topics        - List topics          ║
╚═══════════════════════════════════════════════════════╝
  `);
});