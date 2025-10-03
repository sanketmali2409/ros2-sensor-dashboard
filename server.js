const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));


let latestROS2Data = {
  message: null,
  timestamp: null,
  node_name: null,
  message_count: 0
};

let messageHistory = [];
let ros2Process = null;


app.post('/api/ros2/launch', (req, res) => {
  const { package_name, launch_file } = req.body;
  
  if (!package_name || !launch_file) {
    return res.status(400).json({ 
      error: 'package_name and launch_file required' 
    });
  }

  try {
   
    if (ros2Process) {
      ros2Process.kill();
    }

    
    ros2Process = spawn('ros2', ['launch', package_name, launch_file], {
      cwd: process.env.HOME + '/ros2_ws'
    });

    let outputBuffer = '';

    ros2Process.stdout.on('data', (data) => {
      const output = data.toString();
      outputBuffer += output;
      console.log(`ROS2 OUTPUT: ${output}`);
      
     
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


app.post('/api/ros2/stop', (req, res) => {
  if (ros2Process) {
    ros2Process.kill('SIGINT');
    ros2Process = null;
    res.json({ success: true, message: 'ROS2 processes stopped' });
  } else {
    res.json({ success: false, message: 'No ROS2 process running' });
  }
});


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


function parseROS2Output(output) {
  
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


app.get('/api/ros2/data', (req, res) => {
  res.json(latestROS2Data);
});


app.get('/api/ros2/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(messageHistory.slice(0, limit));
});


app.get('/api/ros2/status', (req, res) => {
  res.json({
    is_running: ros2Process !== null,
    pid: ros2Process ? ros2Process.pid : null,
    message_count: latestROS2Data.message_count,
    last_message_time: latestROS2Data.timestamp
  });
});


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




// const express = require('express');
// const cors = require('cors');
// const { spawn } = require('child_process');
// const path = require('path');

// const app = express();
// const PORT = 3000;

// app.use(cors());
// app.use(express.json());
// app.use(express.static('public'));

// let runningProcesses = {};
// let latestROS2Data = {
//   message: null,
//   timestamp: null,
//   node_name: null,
//   message_count: 0
// };
// let messageHistory = [];

// app.post('/api/ros2/run-node', (req, res) => {
//   const { package_name, node_name } = req.body;
  
//   if (!package_name || !node_name) {
//     return res.status(400).json({ 
//       error: 'package_name and node_name required' 
//     });
//   }

//   if (runningProcesses[node_name]) {
//     return res.json({
//       success: false,
//       message: `Node ${node_name} is already running`,
//       pid: runningProcesses[node_name].pid
//     });
//   }

//   try {
//     const nodeProcess = spawn('ros2', ['run', package_name, node_name], {
//       cwd: process.env.HOME + '/ros2_ws',
//       env: { ...process.env }
//     });

//     runningProcesses[node_name] = {
//       process: nodeProcess,
//       pid: nodeProcess.pid,
//       package: package_name,
//       startTime: new Date().toISOString()
//     };

//     nodeProcess.stdout.on('data', (data) => {
//       const output = data.toString();
//       console.log(`[${node_name}] ${output}`);
//       parseROS2Output(output, node_name);
//     });

//     nodeProcess.stderr.on('data', (data) => {
//       const error = data.toString();
//       console.error(`[${node_name}] ERROR: ${error}`);
//     });

//     nodeProcess.on('close', (code) => {
//       console.log(`[${node_name}] Process exited with code ${code}`);
//       delete runningProcesses[node_name];
//     });

//     res.json({ 
//       success: true, 
//       message: `Started ${package_name}/${node_name}`,
//       pid: nodeProcess.pid
//     });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// app.post('/api/ros2/stop-node', (req, res) => {
//   const { node_name } = req.body;
  
//   if (!node_name) {
//     return res.status(400).json({ error: 'node_name required' });
//   }

//   if (!runningProcesses[node_name]) {
//     return res.json({ 
//       success: false, 
//       message: `Node ${node_name} is not running` 
//     });
//   }

//   try {
//     runningProcesses[node_name].process.kill('SIGINT');
//     delete runningProcesses[node_name];
//     res.json({ 
//       success: true, 
//       message: `Stopped ${node_name}` 
//     });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// app.post('/api/ros2/run-multiple', (req, res) => {
//   const { nodes } = req.body;
  
//   if (!nodes || !Array.isArray(nodes)) {
//     return res.status(400).json({ error: 'nodes array required' });
//   }

//   const results = [];
  
//   nodes.forEach(node => {
//     try {
//       if (runningProcesses[node.node_name]) {
//         results.push({
//           node: node.node_name,
//           success: false,
//           message: 'Already running'
//         });
//         return;
//       }

//       const nodeProcess = spawn('ros2', ['run', node.package_name, node.node_name], {
//         cwd: process.env.HOME + '/ros2_ws',
//         env: { ...process.env }
//       });

//       runningProcesses[node.node_name] = {
//         process: nodeProcess,
//         pid: nodeProcess.pid,
//         package: node.package_name,
//         startTime: new Date().toISOString()
//       };

//       nodeProcess.stdout.on('data', (data) => {
//         parseROS2Output(data.toString(), node.node_name);
//       });

//       nodeProcess.on('close', () => {
//         delete runningProcesses[node.node_name];
//       });

//       results.push({
//         node: node.node_name,
//         success: true,
//         pid: nodeProcess.pid
//       });
//     } catch (error) {
//       results.push({
//         node: node.node_name,
//         success: false,
//         error: error.message
//       });
//     }
//   });

//   res.json({ 
//     success: true, 
//     results,
//     total: nodes.length,
//     started: results.filter(r => r.success).length
//   });
// });

// app.post('/api/ros2/launch', (req, res) => {
//   const { package_name, launch_file } = req.body;
  
//   if (!package_name || !launch_file) {
//     return res.status(400).json({ 
//       error: 'package_name and launch_file required' 
//     });
//   }

//   if (runningProcesses['__launch_file__']) {
//     runningProcesses['__launch_file__'].process.kill();
//   }

//   try {
//     const launchProcess = spawn('ros2', ['launch', package_name, launch_file], {
//       cwd: process.env.HOME + '/ros2_ws'
//     });

//     runningProcesses['__launch_file__'] = {
//       process: launchProcess,
//       pid: launchProcess.pid,
//       package: package_name,
//       startTime: new Date().toISOString()
//     };

//     launchProcess.stdout.on('data', (data) => {
//       parseROS2Output(data.toString());
//     });

//     launchProcess.on('close', (code) => {
//       console.log(`Launch file exited with code ${code}`);
//       delete runningProcesses['__launch_file__'];
//     });

//     res.json({ 
//       success: true, 
//       message: `Launched ${package_name}/${launch_file}`,
//       pid: launchProcess.pid
//     });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// app.post('/api/ros2/stop', (req, res) => {
//   const stoppedNodes = [];
  
//   Object.keys(runningProcesses).forEach(nodeName => {
//     try {
//       runningProcesses[nodeName].process.kill('SIGINT');
//       stoppedNodes.push(nodeName);
//     } catch (error) {
//       console.error(`Error stopping ${nodeName}:`, error);
//     }
//   });

//   runningProcesses = {};
  
//   res.json({ 
//     success: true, 
//     message: 'All ROS2 processes stopped',
//     stopped: stoppedNodes
//   });
// });

// app.get('/api/ros2/running-nodes', (req, res) => {
//   const nodes = Object.keys(runningProcesses)
//     .filter(name => name !== '__launch_file__')
//     .map(name => ({
//       name,
//       pid: runningProcesses[name].pid,
//       package: runningProcesses[name].package,
//       uptime: Date.now() - new Date(runningProcesses[name].startTime).getTime()
//     }));
  
//   res.json({ 
//     nodes,
//     count: nodes.length
//   });
// });

// app.get('/api/ros2/status', (req, res) => {
//   const runningCount = Object.keys(runningProcesses).length;
  
//   res.json({
//     is_running: runningCount > 0,
//     running_nodes: runningCount,
//     nodes: Object.keys(runningProcesses).map(name => ({
//       name,
//       pid: runningProcesses[name].pid
//     })),
//     message_count: latestROS2Data.message_count,
//     last_message_time: latestROS2Data.timestamp
//   });
// });

// app.get('/api/ros2/nodes', (req, res) => {
//   const proc = spawn('ros2', ['node', 'list']);
//   let output = '';

//   proc.stdout.on('data', (data) => {
//     output += data.toString();
//   });

//   proc.on('close', () => {
//     const nodes = output.trim().split('\n').filter(n => n);
//     res.json({ nodes });
//   });
// });

// app.get('/api/ros2/topics', (req, res) => {
//   const proc = spawn('ros2', ['topic', 'list']);
//   let output = '';

//   proc.stdout.on('data', (data) => {
//     output += data.toString();
//   });

//   proc.on('close', () => {
//     const topics = output.trim().split('\n').filter(t => t);
//     res.json({ topics });
//   });
// });

// app.get('/api/ros2/data', (req, res) => {
//   res.json(latestROS2Data);
// });

// app.get('/api/ros2/history', (req, res) => {
//   const limit = parseInt(req.query.limit) || 50;
//   res.json(messageHistory.slice(0, limit));
// });

// function parseROS2Output(output, nodeName = null) {
//   const logRegex = /\[INFO\]\s+\[[\d.]+\]\s+\[([^\]]+)\]:\s+(.+)/g;
//   let match;

//   while ((match = logRegex.exec(output)) !== null) {
//     const [, detectedNode, message] = match;
    
//     const dataPoint = {
//       node_name: nodeName || detectedNode,
//       message: message.trim(),
//       timestamp: new Date().toISOString(),
//       message_count: ++latestROS2Data.message_count
//     };

//     latestROS2Data = dataPoint;
    
//     messageHistory.unshift(dataPoint);
//     if (messageHistory.length > 100) {
//       messageHistory.pop();
//     }
//   }

//   if (!match && output.trim()) {
//     const dataPoint = {
//       node_name: nodeName || 'unknown',
//       message: output.trim(),
//       timestamp: new Date().toISOString(),
//       message_count: ++latestROS2Data.message_count
//     };

//     latestROS2Data = dataPoint;
//     messageHistory.unshift(dataPoint);
//     if (messageHistory.length > 100) {
//       messageHistory.pop();
//     }
//   }
// }

// app.get('/api/health', (req, res) => {
//   res.json({
//     status: 'running',
//     ros2_active: Object.keys(runningProcesses).length > 0,
//     running_nodes: Object.keys(runningProcesses).length,
//     message_count: latestROS2Data.message_count,
//     timestamp: new Date().toISOString()
//   });
// });

// app.get('/', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

// process.on('SIGINT', () => {
//   console.log('\nShutting down gracefully...');
//   Object.keys(runningProcesses).forEach(nodeName => {
//     try {
//       runningProcesses[nodeName].process.kill('SIGINT');
//     } catch (error) {
//       console.error(`Error stopping ${nodeName}:`, error);
//     }
//   });
//   process.exit(0);
// });

// app.listen(PORT, '0.0.0.0', () => {
//   console.log(`
// ╔═══════════════════════════════════════════════════════╗
// ║  ROS2 Node Manager Server                             ║
// ╠═══════════════════════════════════════════════════════╣
// ║  Server: http://localhost:${PORT}                      ║
// ║                                                       ║
// ║  Node Management:                                     ║
// ║  POST /api/ros2/run-node       - Run single node     ║
// ║  POST /api/ros2/stop-node      - Stop single node    ║
// ║  POST /api/ros2/run-multiple   - Run multiple nodes  ║
// ║  POST /api/ros2/launch         - Launch file         ║
// ║  POST /api/ros2/stop           - Stop all            ║
// ║                                                       ║
// ║  Information:                                         ║
// ║  GET  /api/ros2/running-nodes  - List running nodes  ║
// ║  GET  /api/ros2/status         - System status       ║
// ║  GET  /api/ros2/nodes          - ROS2 nodes          ║
// ║  GET  /api/ros2/topics         - ROS2 topics         ║
// ║  GET  /api/ros2/data           - Latest data         ║
// ║  GET  /api/ros2/history        - Message history     ║
// ╚═══════════════════════════════════════════════════════╝
//   `);
// });