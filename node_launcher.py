#!/usr/bin/env python3
"""
ROS2 Node Launcher - CLI Tool
Easily launch single or multiple ROS2 nodes
"""

import subprocess
import sys
import time
import signal
import argparse
from typing import List, Dict

class ROS2NodeLauncher:
    def __init__(self):
        self.processes = {}
        self.package_name = 'my_robot_controller'
        
        self.available_nodes = {
            '1': {'name': 'publisher_node', 'desc': 'Publisher Node'},
            '2': {'name': 'subscriber_node', 'desc': 'Subscriber Node'},
            '3': {'name': 'service_node', 'desc': 'Service Node'},
            '4': {'name': 'client_node', 'desc': 'Client Node'},
            '5': {'name': 'led_client', 'desc': 'LED Client'},
            '6': {'name': 'led_service', 'desc': 'LED Service'},
            '7': {'name': 'yes_no_service', 'desc': 'Yes/No Service'},
            '8': {'name': 'yes_no_client', 'desc': 'Yes/No Client'}
        }
    
    def display_menu(self):
        """Display available nodes"""
        print("\n" + "="*60)
        print("        ROS2 NODE LAUNCHER - SELECT NODES TO RUN")
        print("="*60)
        print("\nAvailable Nodes:")
        for key, node in self.available_nodes.items():
            status = "🟢 RUNNING" if node['name'] in self.processes else "⚪ STOPPED"
            print(f"  [{key}] {node['desc']:<25} - {status}")
        print("\nCommands:")
        print("  [number]       - Launch single node (e.g., 1)")
        print("  [1,2,3]        - Launch multiple nodes (e.g., 1,2,3)")
        print("  [all]          - Launch all nodes")
        print("  [stop]         - Stop all running nodes")
        print("  [status]       - Show running nodes")
        print("  [quit/q]       - Exit")
        print("="*60)
    
    def launch_node(self, node_name: str) -> bool:
        """Launch a single ROS2 node"""
        if node_name in self.processes:
            print(f"⚠️  {node_name} is already running (PID: {self.processes[node_name].pid})")
            return False
        
        try:
            print(f"🚀 Launching {node_name}...")
            process = subprocess.Popen(
                ['ros2', 'run', self.package_name, node_name],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            self.processes[node_name] = process
            print(f"✅ {node_name} started successfully (PID: {process.pid})")
            return True
            
        except Exception as e:
            print(f"❌ Failed to launch {node_name}: {e}")
            return False
    
    def stop_node(self, node_name: str) -> bool:
        """Stop a single node"""
        if node_name not in self.processes:
            print(f"⚠️  {node_name} is not running")
            return False
        
        try:
            process = self.processes[node_name]
            process.terminate()
            process.wait(timeout=5)
            del self.processes[node_name]
            print(f"🛑 {node_name} stopped")
            return True
        except Exception as e:
            print(f"❌ Error stopping {node_name}: {e}")
            return False
    
    def stop_all_nodes(self):
        """Stop all running nodes"""
        if not self.processes:
            print("⚠️  No nodes are running")
            return
        
        print(f"🛑 Stopping {len(self.processes)} node(s)...")
        for node_name in list(self.processes.keys()):
            self.stop_node(node_name)
        print("✅ All nodes stopped")
    
    def show_status(self):
        """Show status of running nodes"""
        if not self.processes:
            print("\n⚪ No nodes are currently running")
            return
        
        print(f"\n🟢 Running Nodes ({len(self.processes)}):")
        for node_name, process in self.processes.items():
            print(f"   • {node_name:<25} PID: {process.pid}")
    
    def launch_multiple(self, node_keys: List[str]):
        """Launch multiple nodes"""
        for key in node_keys:
            key = key.strip()
            if key in self.available_nodes:
                node_name = self.available_nodes[key]['name']
                self.launch_node(node_name)
                time.sleep(0.5)  # Small delay between launches
            else:
                print(f"⚠️  Invalid node key: {key}")
    
    def launch_all(self):
        """Launch all available nodes"""
        print("🚀 Launching all nodes...")
        for node_info in self.available_nodes.values():
            self.launch_node(node_info['name'])
            time.sleep(0.5)
    
    def cleanup(self):
        """Cleanup on exit"""
        print("\n\n🧹 Cleaning up...")
        self.stop_all_nodes()
        print("👋 Goodbye!")
    
    def run_interactive(self):
        """Run interactive mode"""
        # Setup signal handler for Ctrl+C
        def signal_handler(sig, frame):
            self.cleanup()
            sys.exit(0)
        
        signal.signal(signal.SIGINT, signal_handler)
        
        print("\n🤖 ROS2 Node Launcher Started")
        print("   Package: " + self.package_name)
        
        while True:
            self.display_menu()
            choice = input("\nEnter your choice: ").strip().lower()
            
            if choice in ['quit', 'q', 'exit']:
                self.cleanup()
                break
            
            elif choice == 'all':
                self.launch_all()
            
            elif choice == 'stop':
                self.stop_all_nodes()
            
            elif choice == 'status':
                self.show_status()
            
            elif ',' in choice:
                # Multiple nodes: 1,2,3
                node_keys = choice.split(',')
                self.launch_multiple(node_keys)
            
            elif choice in self.available_nodes:
                # Single node
                node_name = self.available_nodes[choice]['name']
                self.launch_node(node_name)
            
            else:
                print("⚠️  Invalid choice. Try again.")
            
            input("\nPress Enter to continue...")
    
    def run_command_line(self, args):
        """Run with command line arguments"""
        if args.list:
            print("\nAvailable Nodes:")
            for key, node in self.available_nodes.items():
                print(f"  {key}: {node['name']}")
            return
        
        if args.all:
            self.launch_all()
        
        elif args.nodes:
            for node_key in args.nodes:
                if node_key in self.available_nodes:
                    node_name = self.available_nodes[node_key]['name']
                    self.launch_node(node_name)
                else:
                    print(f"⚠️  Invalid node key: {node_key}")
        
        if self.processes:
            print("\n✅ Nodes launched. Press Ctrl+C to stop all nodes.")
            try:
                # Keep running until interrupted
                signal.pause()
            except KeyboardInterrupt:
                self.cleanup()

def main():
    parser = argparse.ArgumentParser(
        description='ROS2 Node Launcher - Launch single or multiple ROS2 nodes easily'
    )
    parser.add_argument(
        '-n', '--nodes',
        nargs='+',
        help='Node keys to launch (e.g., -n 1 2 3)'
    )
    parser.add_argument(
        '-a', '--all',
        action='store_true',
        help='Launch all nodes'
    )
    parser.add_argument(
        '-l', '--list',
        action='store_true',
        help='List available nodes'
    )
    parser.add_argument(
        '-i', '--interactive',
        action='store_true',
        help='Run in interactive mode'
    )
    
    args = parser.parse_args()
    launcher = ROS2NodeLauncher()
    
    # Interactive mode (default if no args)
    if args.interactive or len(sys.argv) == 1:
        launcher.run_interactive()
    else:
        launcher.run_command_line(args)

if __name__ == '__main__':
    main()