import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import * as dotenv from "dotenv"

dotenv.config();

const execAsync = promisify(exec);

const server = new McpServer({
  name: "Foundry MCP Server",
  version: "0.1.0"
}, {
  instructions: `
This server provides tools for Solidity developers using the Foundry toolkit:
- forge: Smart contract development framework
- cast: EVM nodes RPC client and utility tool
- anvil: Local EVM test node

You can interact with local or remote EVM chains, deploy contracts, perform common operations, and analyze smart contract code.
  `
});

 const FOUNDRY_WORKSPACE = path.join(os.homedir(), '.mcp-foundry-workspace');

 async function ensureWorkspaceInitialized() {
  try {
     await fs.mkdir(FOUNDRY_WORKSPACE, { recursive: true });
    
     const isForgeProject = await fs.access(path.join(FOUNDRY_WORKSPACE, 'foundry.toml'))
      .then(() => true)
      .catch(() => false);
    
    if (!isForgeProject) {
       await executeCommand(`cd ${FOUNDRY_WORKSPACE} && ${forgePath} init --no-git`);
    }
    
    return FOUNDRY_WORKSPACE;
  } catch (error) {
    console.error("Error initializing workspace:", error);
    throw error;
  }
}

const getBinaryPaths = () => {
  const homeDir = os.homedir();

   const FOUNDRY_BIN = path.join(homeDir, '.foundry', 'bin');
  
  return {
    castPath: path.join(FOUNDRY_BIN, "cast"),
    forgePath: path.join(FOUNDRY_BIN, "forge"),
    anvilPath: path.join(FOUNDRY_BIN, "anvil"),
    homeDir
  };
};

const { castPath, forgePath, anvilPath, homeDir } = getBinaryPaths();

const DEFAULT_RPC_URL = process.env.RPC_URL || "http://localhost:8545";

const FOUNDRY_NOT_INSTALLED_ERROR = "Foundry tools are not installed. Please install Foundry: https://book.getfoundry.sh/getting-started/installation";

 
async function checkFoundryInstalled() {
  try {
    await execAsync(`${forgePath} --version`);
    return true;
  } catch (error) {
    console.error("Foundry tools check failed:", error);
    return false;
  }
}

 
async function executeCommand(command) {
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr && !stdout) {
      return { success: false, message: stderr };
    }
    return { success: true, message: stdout };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: errorMessage };
  }
}
 
async function resolveRpcUrl(rpcUrl) {
  if (!rpcUrl) {
    return DEFAULT_RPC_URL;
  }
  
  // Handle alias lookup in foundry config
  if (!rpcUrl.startsWith('http')) {
    try {
      // Try to find the RPC endpoint in foundry config
      const configPath = path.join(homeDir, '.foundry', 'config.toml');
      const configExists = await fs.access(configPath).then(() => true).catch(() => false);
      
      if (configExists) {
        const configContent = await fs.readFile(configPath, 'utf8');
        const rpcMatch = new RegExp(`\\[rpc_endpoints\\][\\s\\S]*?${rpcUrl}\\s*=\\s*["']([^"']+)["']`).exec(configContent);
        
        if (rpcMatch && rpcMatch[1]) {
          return rpcMatch[1];
        }
      }
    } catch (error) {
      console.error("Error resolving RPC from config:", error);
    }
  }
  
  return rpcUrl;
}


async function getAnvilInfo() {
  try {
    const { stdout } = await execAsync('ps aux | grep anvil | grep -v grep');
    if (!stdout) {
      return { running: false };
    }
    
    const portMatch = stdout.match(/--port\s+(\d+)/);
    const port = portMatch ? portMatch[1] : '8545';
    
    return {
      running: true,
      port,
      url: `http://localhost:${port}`
    };
  } catch (error) {
    return { running: false };
  }
}

//===================================================================================================
// RESOURCES
//===================================================================================================

// Resource: Anvil status
server.resource(
  "anvil_status",
  "anvil://status",
  async (uri) => {
    const info = await getAnvilInfo();
    return {
      contents: [{
        uri: uri.href,
        text: JSON.stringify(info, null, 2)
      }]
    };
  }
)
 
// Resource: Contract source from Etherscan
server.resource(
  "contract_source",
  new ResourceTemplate("contract://{address}/source", { list: undefined }),
  async (uri, { address }) => {
    try {
      const command = `${castPath} etherscan-source ${address}`;
      const { success, message } = await executeCommand(command);
      
      if (success) {
        return {
          contents: [{
            uri: uri.href,
            text: message
          }]
        };
      } else {
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({ error: "Could not retrieve contract source", details: message })
          }]
        };
      }
    } catch (error) {
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify({ error: "Failed to retrieve contract source" })
        }]
      };
    }
  }
);

//===================================================================================================
// CAST TOOLS
//===================================================================================================

// Tool: Call a contract function (read-only)
server.tool(
  "cast_call",
  "Call a contract function (read-only)",
  {
    contractAddress: z.string().describe("Address of the contract"),
    functionSignature: z.string().describe("Function signature (e.g., 'balanceOf(address)')"),
    args: z.array(z.string()).optional().describe("Function arguments"),
    rpcUrl: z.string().optional().describe("JSON-RPC URL (default: http://localhost:8545)"),
    blockNumber: z.string().optional().describe("Block number (e.g., 'latest', 'earliest', or a number)"),
    from: z.string().optional().describe("Address to perform the call as")
  },
  async ({ contractAddress, functionSignature, args = [], rpcUrl, blockNumber, from }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    const resolvedRpcUrl = await resolveRpcUrl(rpcUrl);
    let command = `${castPath} call ${contractAddress} "${functionSignature}"`;
    
    if (args.length > 0) {
      command += " " + args.join(" ");
    }
    
    if (resolvedRpcUrl) {
      command += ` --rpc-url "${resolvedRpcUrl}"`;
    }
    
    if (blockNumber) {
      command += ` --block ${blockNumber}`;
    }
    
    if (from) {
      command += ` --from ${from}`;
    }
    
    const result = await executeCommand(command);
    
    let formattedOutput = result.message;
    if (result.success) {
      // Try to detect arrays and format them better
      if (formattedOutput.includes('\n') && !formattedOutput.includes('Error')) {
        formattedOutput = formattedOutput.split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .join('\n');
      }
    }
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `Call to ${contractAddress}.${functionSignature.split('(')[0]} result:\n${formattedOutput}` 
          : `Call failed: ${result.message}` 
      }],
      isError: !result.success
    };
  }
);

// Tool: Send a transaction to a contract function
server.tool(
  "cast_send",
  "Send a transaction to a contract function",
  {
    contractAddress: z.string().describe("Address of the contract"),
    functionSignature: z.string().describe("Function signature (e.g., 'transfer(address,uint256)')"),
    args: z.array(z.string()).optional().describe("Function arguments"),
    from: z.string().optional().describe("Sender address or private key"),
    value: z.string().optional().describe("Ether value to send with the transaction (in wei)"),
    rpcUrl: z.string().optional().describe("JSON-RPC URL (default: http://localhost:8545)"),
    gasLimit: z.string().optional().describe("Gas limit for the transaction"),
    gasPrice: z.string().optional().describe("Gas price for the transaction (in wei)"),
    confirmations: z.number().optional().describe("Number of confirmations to wait for")
  },
  async ({ contractAddress, functionSignature, args = [], from, value, rpcUrl, gasLimit, gasPrice, confirmations }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    const resolvedRpcUrl = await resolveRpcUrl(rpcUrl);
    const privateKey = process.env.PRIVATE_KEY;
    let command = `${castPath} send ${contractAddress} "${functionSignature}" --private-key ${[privateKey]}`;
    
    if (args.length > 0) {
      command += " " + args.join(" ");
    }
    
    if (from) {
      command += ` --from ${from}`;
    }
    
    if (value) {
      command += ` --value ${value}`;
    }
    
    if (resolvedRpcUrl) {
      command += ` --rpc-url "${resolvedRpcUrl}"`;
    }
    
    if (gasLimit) {
      command += ` --gas-limit ${gasLimit}`;
    }
    
    if (gasPrice) {
      command += ` --gas-price ${gasPrice}`;
    }
    
    if (confirmations) {
      command += ` --confirmations ${confirmations}`;
    }
    
    const result = await executeCommand(command);
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `Transaction sent successfully:\n${result.message}` 
          : `Transaction failed: ${result.message}` 
      }],
      isError: !result.success
    };
  }
);

// Tool: Check the ETH balance of an address
server.tool(
  "cast_balance",
  "Check the ETH balance of an address",
  {
    address: z.string().describe("Ethereum address to check balance for"),
    rpcUrl: z.string().optional().describe("JSON-RPC URL (default: http://localhost:8545)"),
    blockNumber: z.string().optional().describe("Block number (e.g., 'latest', 'earliest', or a number)"),
    formatEther: z.boolean().optional().describe("Format the balance in Ether (default: wei)")
  },
  async ({ address, rpcUrl, blockNumber, formatEther = false }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    const resolvedRpcUrl = await resolveRpcUrl(rpcUrl);
    let command = `${castPath} balance ${address}`;
    
    if (resolvedRpcUrl) {
      command += ` --rpc-url "${resolvedRpcUrl}"`;
    }
    
    if (blockNumber) {
      command += ` --block ${blockNumber}`;
    }
    
    if (formatEther) {
      command += " --ether";
    }
    
    const result = await executeCommand(command);
    const unit = formatEther ? "ETH" : "wei";
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `Balance of ${address}: ${result.message.trim()} ${unit}` 
          : `Failed to get balance: ${result.message}` 
      }],
      isError: !result.success
    };
  }
);

// Tool: Get transaction receipt
server.tool(
  "cast_receipt",
  "Get the transaction receipt",
  {
    txHash: z.string().describe("Transaction hash"),
    rpcUrl: z.string().optional().describe("JSON-RPC URL (default: http://localhost:8545)"),
    confirmations: z.number().optional().describe("Number of confirmations to wait for"),
    field: z.string().optional().describe("Specific field to extract (e.g., 'blockNumber', 'status')")
  },
  async ({ txHash, rpcUrl, confirmations, field }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    const resolvedRpcUrl = await resolveRpcUrl(rpcUrl);
    let command = `${castPath} receipt ${txHash}`;
    
    if (resolvedRpcUrl) {
      command += ` --rpc-url "${resolvedRpcUrl}"`;
    }
    
    if (confirmations) {
      command += ` --confirmations ${confirmations}`;
    }
    
    if (field) {
      command += ` ${field}`;
    }
    
    const result = await executeCommand(command);
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `Transaction receipt for ${txHash}${field ? ` (${field})` : ""}:\n${result.message}` 
          : `Failed to get receipt: ${result.message}` 
      }],
      isError: !result.success
    };
  }
);

// Tool: Read a contract's storage at a given slot
server.tool(
  "cast_storage",
  "Read contract storage at a specific slot",
  {
    address: z.string().describe("Contract address"),
    slot: z.string().describe("Storage slot to read"),
    rpcUrl: z.string().optional().describe("JSON-RPC URL (default: http://localhost:8545)"),
    blockNumber: z.string().optional().describe("Block number (e.g., 'latest', 'earliest', or a number)")
  },
  async ({ address, slot, rpcUrl, blockNumber }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    const resolvedRpcUrl = await resolveRpcUrl(rpcUrl);
    let command = `${castPath} storage ${address} ${slot}`;
    
    if (resolvedRpcUrl) {
      command += ` --rpc-url "${resolvedRpcUrl}"`;
    }
    
    if (blockNumber) {
      command += ` --block ${blockNumber}`;
    }
    
    const result = await executeCommand(command);
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `Storage at ${address} slot ${slot}: ${result.message.trim()}` 
          : `Failed to read storage: ${result.message}` 
      }],
      isError: !result.success
    };
  }
);

// Tool: Run a published transaction in a local environment and print the trace
server.tool(
  "cast_run",
  "Runs a published transaction in a local environment and prints the trace",
  {
    txHash: z.string().describe("Transaction hash to replay"),
    rpcUrl: z.string().describe("JSON-RPC URL"),
    quick: z.boolean().optional().describe("Execute the transaction only with the state from the previous block"),
    debug: z.boolean().optional().describe("Open the transaction in the debugger"),
    labels: z.array(z.string()).optional().describe("Label addresses in the trace (format: <address>:<label>)")
  },
  async ({ txHash, rpcUrl, quick = false, debug = false, labels = [] }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    const resolvedRpcUrl = await resolveRpcUrl(rpcUrl);
    let command = `${castPath} run ${txHash}`;
    
    if (resolvedRpcUrl) {
      command += ` --rpc-url "${resolvedRpcUrl}"`;
    }
    
    if (quick) {
      command += " --quick";
    }
    
    if (debug) {
      command += " --debug";
    }
    
    // Add labels if provided
    for (const label of labels) {
      command += ` --label ${label}`;
    }
    
    const result = await executeCommand(command);
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `Transaction trace for ${txHash}:\n${result.message}` 
          : `Failed to run transaction: ${result.message}` 
      }],
      isError: !result.success
    };
  }
);

// Tool: Get logs by signature or topic
server.tool(
  "cast_logs",
  "Get logs by signature or topic",
  {
    signature: z.string().describe("Event signature (e.g., 'Transfer(address,address,uint256)') or topic 0 hash"),
    topics: z.array(z.string()).optional().describe("Additional topics (up to 3)"),
    address: z.string().optional().describe("Contract address to filter logs from"),
    fromBlock: z.string().optional().describe("Starting block number/tag"),
    toBlock: z.string().optional().describe("Ending block number/tag"),
    rpcUrl: z.string().optional().describe("JSON-RPC URL (default: http://localhost:8545)")
  },
  async ({ signature, topics = [], address, fromBlock, toBlock, rpcUrl }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    const resolvedRpcUrl = await resolveRpcUrl(rpcUrl);
    let command = `${castPath} logs "${signature}"`;
    
    if (topics.length > 0) {
      command += " " + topics.join(" ");
    }
    
    if (address) {
      command += ` --address ${address}`;
    }
    
    if (fromBlock) {
      command += ` --from-block ${fromBlock}`;
    }
    
    if (toBlock) {
      command += ` --to-block ${toBlock}`;
    }
    
    if (resolvedRpcUrl) {
      command += ` --rpc-url "${resolvedRpcUrl}"`;
    }
    
    const result = await executeCommand(command);
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `Logs for signature "${signature}":\n${result.message}` 
          : `Failed to get logs: ${result.message}` 
      }],
      isError: !result.success
    };
  }
);

// Tool: Lookup function or event signatures
server.tool(
  "cast_sig",
  "Get the selector for a function or event signature",
  {
    signature: z.string().describe("Function or event signature"),
    isEvent: z.boolean().optional().describe("Whether the signature is for an event (default: false)")
  },
  async ({ signature, isEvent = false }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    const command = isEvent 
      ? `${castPath} sig-event "${signature}"` 
      : `${castPath} sig "${signature}"`;
    
    const result = await executeCommand(command);
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `Selector for ${isEvent ? "event" : "function"} "${signature}": ${result.message.trim()}` 
          : `Selector generation failed: ${result.message}` 
      }],
      isError: !result.success
    };
  }
);

// Tool: Get event or function signature using 4byte directory
server.tool(
  "cast_4byte",
  "Lookup function or event signature from the 4byte directory",
  {
    selector: z.string().describe("Function selector (0x + 4 bytes) or event topic (0x + 32 bytes)"),
    isEvent: z.boolean().optional().describe("Whether to lookup an event (default: false)")
  },
  async ({ selector, isEvent = false }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    const command = isEvent 
      ? `${castPath} 4byte-event ${selector}` 
      : `${castPath} 4byte ${selector}`;
    
    const result = await executeCommand(command);
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `Possible ${isEvent ? "event" : "function"} signatures for ${selector}:\n${result.message}` 
          : `Lookup failed: ${result.message}` 
      }],
      isError: !result.success
    };
  }
);

// Tool: Get chain information
server.tool(
  "cast_chain",
  "Get information about the current chain",
  {
    rpcUrl: z.string().optional().describe("JSON-RPC URL (default: http://localhost:8545)"),
    returnId: z.boolean().optional().describe("Return the chain ID instead of the name (default: false)")
  },
  async ({ rpcUrl, returnId = false }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    const resolvedRpcUrl = await resolveRpcUrl(rpcUrl);
    const command = returnId 
      ? `${castPath} chain-id --rpc-url "${resolvedRpcUrl}"` 
      : `${castPath} chain --rpc-url "${resolvedRpcUrl}"`;
    
    const result = await executeCommand(command);
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `Chain ${returnId ? "ID" : "name"}: ${result.message.trim()}` 
          : `Failed to get chain information: ${result.message}` 
      }],
      isError: !result.success
    };
  }
);

//===================================================================================================
// ANVIL TOOLS
//===================================================================================================

// Tool: Start a new Anvil instance
server.tool(
  "anvil_start",
  "Start a new Anvil instance (local Ethereum node)",
  {
    port: z.number().optional().describe("Port to listen on (default: 8545)"),
    blockTime: z.number().optional().describe("Block time in seconds (default: 0 - mine on demand)"),
    forkUrl: z.string().optional().describe("URL of the JSON-RPC endpoint to fork from"),
    forkBlockNumber: z.number().optional().describe("Block number to fork from"),
    accounts: z.number().optional().describe("Number of accounts to generate (default: 10)"),
    mnemonic: z.string().optional().describe("BIP39 mnemonic phrase to generate accounts from"),
    silent: z.boolean().optional().describe("Suppress anvil output (default: false)")
  },
  async ({ port = 8545, blockTime, forkUrl, forkBlockNumber, accounts, mnemonic, silent = false }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    // Check if anvil is already running
    const anvilInfo = await getAnvilInfo();
    if (anvilInfo.running) {
      return {
        content: [{ 
          type: "text", 
          text: `Anvil is already running on port ${anvilInfo.port}.`
        }],
        isError: true
      };
    }

    let command = `${anvilPath} --port ${port}`;
    
    if (blockTime !== undefined) {
      command += ` --block-time ${blockTime}`;
    }
    
    if (forkUrl) {
      command += ` --fork-url "${forkUrl}"`;
      
      if (forkBlockNumber !== undefined) {
        command += ` --fork-block-number ${forkBlockNumber}`;
      }
    }
    
    if (accounts !== undefined) {
      command += ` --accounts ${accounts}`;
    }
    
    if (mnemonic) {
      command += ` --mnemonic "${mnemonic}"`;
    }
    
    try {
      // Start anvil in the background
      const child = exec(command, (error, stdout, stderr) => {
        if (error && !silent) {
          console.error(`Anvil error: ${error.message}`);
        }
        if (stderr && !silent) {
          console.error(`Anvil stderr: ${stderr}`);
        }
        if (stdout && !silent) {
          console.log(`Anvil stdout: ${stdout}`);
        }
      });
      
      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check if it started successfully
      const newAnvilInfo = await getAnvilInfo();
      if (newAnvilInfo.running) {
        return {
          content: [{ 
            type: "text", 
            text: `Anvil started successfully on port ${port}. ` +
                  `RPC URL: http://localhost:${port}\n` +
                  `Process ID: ${child.pid}`
          }]
        };
      } else {
        return {
          content: [{ 
            type: "text", 
            text: `Failed to start Anvil. Check system logs for details.`
          }],
          isError: true
        };
      }
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error starting Anvil: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
);

// Tool: Stop an Anvil instance
server.tool(
  "anvil_stop",
  "Stop a running Anvil instance",
  {},
  async () => {
    const anvilInfo = await getAnvilInfo();
    if (!anvilInfo.running) {
      return {
        content: [{ 
          type: "text", 
          text: "No Anvil instance is currently running."
        }],
        isError: true
      };
    }

    try {
      // Kill the anvil process
      if (os.platform() === 'win32') {
        await execAsync('taskkill /F /IM anvil.exe');
      } else {
        await execAsync('pkill -f anvil');
      }
      
      // Check if it was stopped successfully
      await new Promise(resolve => setTimeout(resolve, 500));
      const newAnvilInfo = await getAnvilInfo();
      
      if (!newAnvilInfo.running) {
        return {
          content: [{ 
            type: "text", 
            text: "Anvil has been stopped successfully."
          }]
        };
      } else {
        return {
          content: [{ 
            type: "text", 
            text: "Failed to stop Anvil. It may still be running."
          }],
          isError: true
        };
      }
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error stopping Anvil: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
);

// Tool: Get current Anvil status
server.tool(
  "anvil_status",
  "Check if Anvil is running and get its status",
  {},
  async () => {
    const anvilInfo = await getAnvilInfo();
    
    return {
      content: [{ 
        type: "text", 
        text: anvilInfo.running
          ? `Anvil is running on port ${anvilInfo.port}. RPC URL: ${anvilInfo.url}`
          : "Anvil is not currently running."
      }]
    };
  }
);

// Tool: Run Forge scripts
server.tool(
  "forge_script",
  "Run a Forge script from the workspace",
  {
    scriptPath: z.string().describe("Path to the script file (e.g., 'script/Deploy.s.sol')"),
    sig: z.string().optional().describe("Function signature to call (default: 'run()')"),
    rpcUrl: z.string().optional().describe("JSON-RPC URL (default: http://localhost:8545)"),
    broadcast: z.boolean().optional().describe("Broadcast the transactions"),
    verify: z.boolean().optional().describe("Verify the contract on Etherscan (needs API key)")
  },
  async ({ scriptPath, sig = "run()", rpcUrl, broadcast = false, verify = false }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    try {
      const workspace = await ensureWorkspaceInitialized();
      
      // Check if script exists
      const scriptFullPath = path.join(workspace, scriptPath);
      const scriptExists = await fs.access(scriptFullPath).then(() => true).catch(() => false);
      if (!scriptExists) {
        return {
          content: [{ 
            type: "text", 
            text: `Script does not exist at ${scriptFullPath}` 
          }],
          isError: true
        };
      }

      const resolvedRpcUrl = await resolveRpcUrl(rpcUrl);
      let command = `cd ${workspace} && ${forgePath} script ${scriptPath} --sig "${sig}"`;
      
      if (resolvedRpcUrl) {
        command += ` --rpc-url "${resolvedRpcUrl}"`;
      }
      
      if (broadcast) {
        command += ` --broadcast`;
      }
      
      if (verify) {
        command += ` --verify`;
      }
      
      const result = await executeCommand(command);
      
      return {
        content: [{ 
          type: "text", 
          text: result.success 
            ? `Script executed successfully:\n${result.message}` 
            : `Script execution failed: ${result.message}` 
        }],
        isError: !result.success
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error executing script: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  }
);
 

//===================================================================================================
// UTILITY TOOLS
//===================================================================================================

// Tool: Convert between units (wei, gwei, ether)
server.tool(
  "convert_eth_units",
  "Convert between Ethereum units (wei, gwei, ether)",
  {
    value: z.string().describe("Value to convert"),
    fromUnit: z.enum(["wei", "gwei", "ether"]).describe("Source unit"),
    toUnit: z.enum(["wei", "gwei", "ether"]).describe("Target unit")
  },
  async ({ value, fromUnit, toUnit }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    const command = `${castPath} to-unit ${value}${fromUnit} ${toUnit}`;
    const result = await executeCommand(command);
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `${value} ${fromUnit} = ${result.message.trim()} ${toUnit}` 
          : `Conversion failed: ${result.message}` 
      }],
      isError: !result.success
    };
  }
);

// Tool: Calculate contract address
server.tool(
  "compute_address",
  "Compute the address of a contract that would be deployed by a specific address",
  {
    deployerAddress: z.string().describe("Address of the deployer"),
    nonce: z.string().optional().describe("Nonce of the transaction (default: current nonce)"),
    rpcUrl: z.string().optional().describe("JSON-RPC URL (default: http://localhost:8545)")
  },
  async ({ deployerAddress, nonce, rpcUrl }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    const resolvedRpcUrl = await resolveRpcUrl(rpcUrl);
    let command = `${castPath} compute-address ${deployerAddress}`;
    
    if (nonce) {
      command += ` --nonce ${nonce}`;
    }
    
    if (resolvedRpcUrl) {
      command += ` --rpc-url "${resolvedRpcUrl}"`;
    }
    
    const result = await executeCommand(command);
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `Computed contract address:\n${result.message}` 
          : `Address computation failed: ${result.message}` 
      }],
      isError: !result.success
    };
  }
);

// Tool: Get contract bytecode size
server.tool(
  "contract_size",
  "Get the bytecode size of a deployed contract",
  {
    address: z.string().describe("Contract address"),
    rpcUrl: z.string().optional().describe("JSON-RPC URL (default: http://localhost:8545)")
  },
  async ({ address, rpcUrl }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    const resolvedRpcUrl = await resolveRpcUrl(rpcUrl);
    let command = `${castPath} codesize ${address}`;
    
    if (resolvedRpcUrl) {
      command += ` --rpc-url "${resolvedRpcUrl}"`;
    }
    
    const result = await executeCommand(command);
    
    const bytes = parseInt(result.message);
    let sizeInfo = "";
    if (!isNaN(bytes)) {
      const kilobytes = bytes / 1024;
      const contractLimit = 24576; // 24KB limit for contracts
      const percentOfLimit = (bytes / contractLimit) * 100;
      
      sizeInfo = `\n\n${bytes} bytes (${kilobytes.toFixed(2)} KB)\n` +
                 `EVM Contract Size Limit: 24KB (24576 bytes)\n` +
                 `Current size is ${percentOfLimit.toFixed(2)}% of the maximum`;
    }
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `Contract bytecode size for ${address}:${sizeInfo}` 
          : `Failed to get contract size: ${result.message}` 
      }],
      isError: !result.success
    };
  }
);

// server.tool(
//   "estimate_gas",
//   "Estimate the gas cost of a transaction",
//   {
//     to: z.string().describe("Recipient address"),
//     functionSignature: z.string().describe("Function signature (e.g., 'transfer(address,uint256)')"),
//     args: z.array(z.string()).optional().describe("Function arguments"),
//     value: z.string().optional().describe("Ether value to send with the transaction (in wei)"),
//     rpcUrl: z.string().optional().describe("JSON-RPC URL (default: http://localhost:8545)")
//   },
//   async ({ to, functionSignature, args = [], value, rpcUrl }) => {
//     const installed = await checkFoundryInstalled();
//     if (!installed) {
//       return {
//         content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
//         isError: true
//       };
//     }

//     const resolvedRpcUrl = await resolveRpcUrl(rpcUrl);
//     let command = `${castPath} estimate ${to} "${functionSignature}"`;
    
//     if (args.length > 0) {
//       command += " " + args.join(" ");
//     }
    
//     if (value) {
//       command += ` --value ${value}`;
//     }
    
//     if (resolvedRpcUrl) {
//       command += ` --rpc-url "${resolvedRpcUrl}"`;
//     }
    
//     const result = await executeCommand(command);
//     const gasEstimate = result.message.trim();
    
//     // Get current gas price to calculate cost in ETH
//     let gasPriceInfo = "";
//     try {
//       const gasPriceCommand = `${castPath} gas-price --rpc-url "${resolvedRpcUrl}"`;
//       const gasPriceResult = await executeCommand(gasPriceCommand);
//       if (gasPriceResult.success) {
//         const gasPrice = gasPriceResult.message.trim();
//         const cost = BigInt(gasEstimate) * BigInt(gasPrice);
        
//         // Convert wei to ETH
//         const ethCommand = `${castPath} from-wei ${cost}`;
//         const ethResult = await executeCommand(ethCommand);
//         if (ethResult.success) {
//           gasPriceInfo = `\nGas Price: ${gasPrice} wei\nEstimated Cost: ${ethResult.message.trim()} ETH`;
//         }
//       }
//     } catch (error) {
//       console.error("Error getting gas price:", error);
//     }
    
//     return {
//       content: [{ 
//         type: "text", 
//         text: result.success 
//           ? `Estimated gas for calling ${functionSignature} on ${to}: ${gasEstimate} gas units${gasPriceInfo}` 
//           : `Gas estimation failed: ${result.message}` 
//       }],
//       isError: !result.success
//     };
//   }
// );

// Tool: Create or update a Solidity file (contract, script, etc.)
server.tool(
  "create_solidity_file",
  "Create or update a Solidity file in the workspace",
  {
    filePath: z.string().describe("Path to the file (e.g., 'src/MyContract.sol' or 'script/Deploy.s.sol')"),
    content: z.string().describe("File content"),
    overwrite: z.boolean().optional().describe("Overwrite existing file (default: false)")
  },
  async ({ filePath, content, overwrite = false }) => {
    try {
      const workspace = await ensureWorkspaceInitialized();
      const fullFilePath = path.join(workspace, filePath);
      
      const fileExists = await fs.access(fullFilePath).then(() => true).catch(() => false);
      if (fileExists && !overwrite) {
        return {
          content: [{ 
            type: "text", 
            text: `File already exists at ${fullFilePath}. Use overwrite=true to replace it.` 
          }],
          isError: true
        };
      }
      
      await fs.mkdir(path.dirname(fullFilePath), { recursive: true });
      
      await fs.writeFile(fullFilePath, content);
      
      return {
        content: [{ 
          type: "text", 
          text: `File ${fileExists ? 'updated' : 'created'} successfully at ${fullFilePath}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error managing file: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  }
);

// Tool: Install dependencies for the workspace
server.tool(
  "install_dependency",
  "Install a dependency for the Forge workspace",
  {
    dependency: z.string().describe("GitHub repository to install (e.g., 'OpenZeppelin/openzeppelin-contracts')"),
    version: z.string().optional().describe("Version tag or branch to install (default: latest)")
  },
  async ({ dependency, version }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    try {
       const workspace = await ensureWorkspaceInitialized();
      
       let command = `cd ${workspace} && ${forgePath} install ${dependency} --no-commit`;
      if (version) {
        command += ` --tag ${version}`;
      }
      
      const result = await executeCommand(command);
      
      return {
        content: [{ 
          type: "text", 
          text: result.success 
            ? `Dependency installed successfully:\n${result.message}` 
            : `Failed to install dependency: ${result.message}` 
        }],
        isError: !result.success
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error installing dependency: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  }
);

// Tool: List files in the workspace
server.tool(
  "list_files",
  "List files in the workspace",
  {
    directory: z.string().optional().describe("Directory to list (e.g., 'src' or 'script'), defaults to root")
  },
  async ({ directory = '' }) => {
    try {
       const workspace = await ensureWorkspaceInitialized();
      const dirPath = path.join(workspace, directory);
      
       const dirExists = await fs.access(dirPath).then(() => true).catch(() => false);
      if (!dirExists) {
        return {
          content: [{ 
            type: "text", 
            text: `Directory '${directory}' does not exist in the workspace` 
          }],
          isError: true
        };
      }
      
       async function listFiles(dir, baseDir = '') {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        let files = [];
        
        for (const entry of entries) {
          const relativePath = path.join(baseDir, entry.name);
          if (entry.isDirectory()) {
            const subFiles = await listFiles(path.join(dir, entry.name), relativePath);
            files = [...files, ...subFiles];
          } else {
            files.push(relativePath);
          }
        }
        
        return files;
      }
      
      const files = await listFiles(dirPath);
      return {
        content: [{ 
          type: "text", 
          text: files.length > 0
            ? `Files in ${directory || 'workspace'}:\n\n${files.join('\n')}`
            : `No files found in ${directory || 'workspace'}`
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error listing files: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  }
);

// Tool: Read a file from the workspace
server.tool(
  "read_file",
  "Read the content of a file from the workspace",
  {
    filePath: z.string().describe("Path to the file (e.g., 'src/MyContract.sol')")
  },
  async ({ filePath }) => {
    try {
      const workspace = await ensureWorkspaceInitialized();
      const fullFilePath = path.join(workspace, filePath);
      
       const fileExists = await fs.access(fullFilePath).then(() => true).catch(() => false);
      if (!fileExists) {
        return {
          content: [{ 
            type: "text", 
            text: `File does not exist at ${fullFilePath}` 
          }],
          isError: true
        };
      }
      
      const content = await fs.readFile(fullFilePath, 'utf8');
      
      return {
        content: [{ 
          type: "text", 
          text: `Content of ${filePath}:\n\n${content}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error reading file: ${error instanceof Error ? error.message : String(error)}` 
        }],
        isError: true
      };
    }
  }
);

async function startServer() {
  const foundryInstalled = await checkFoundryInstalled();
  if (!foundryInstalled) {
    console.error("Error: Foundry is not installed");
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Foundry MCP Server started on stdio");
}

startServer().catch((error) => {
  console.error("Error starting server:", error);
  process.exit(1);
});