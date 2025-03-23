import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as dotenv from 'dotenv';
import * as os from 'os';
dotenv.config();

const execAsync = promisify(exec);

const server = new McpServer({
  name: "Foundry MCP Server",
  version: "0.1.0"
}, {
  instructions: "This server provides tools for Solidity developers using the Foundry toolkit (anvil, forge, cast, and chisel)."
});

// Paths to Foundry executables
const FOUNDRY_BIN = os.homedir() + "/.foundry/bin";
console.log(FOUNDRY_BIN)
const castPath = path.join(FOUNDRY_BIN, "cast");
const forgePath =  path.join(FOUNDRY_BIN, "forge");
const chiselPath =   path.join(FOUNDRY_BIN, "chisel");
const anvilPath = path.join(FOUNDRY_BIN, "anvil");
const mescPath =  path.join(os.homedir(), "mesc");  

// Default RPC URL (can be overridden)
const DEFAULT_RPC_URL = process.env.ETH_RPC_URL || "http://localhost:8545";

// Error messages
const FOUNDRY_NOT_INSTALLED_ERROR = "Foundry tools are not installed. Please install Foundry: https://book.getfoundry.sh/getting-started/installation";
const ANVIL_NOT_RUNNING_ERROR = "Anvil instance not running. Please start anvil using the 'anvil_start' tool first.";

// Check if Foundry tools are installed
async function checkFoundryInstalled() {
  try {
    await execAsync(`${forgePath} --version`);
    return true;
  } catch (error) {
    console.error("checkFoundryInstalled error:", error);
    return false;
  }
}

// Execute a command and return result
async function executeCommand(command: string) {
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

// TODO: Change it to be a tool
async function resolveRpcUrl(rpcUrl: string | undefined) {
  if (!rpcUrl || rpcUrl.startsWith("mesc:")) {
    try {
      // If rpcUrl starts with mesc:, use that as the endpoint name, otherwise use default endpoint
      const endpointName = rpcUrl ? rpcUrl.substring(5) : "";
      const args = endpointName ? ["url", endpointName] : ["url"];
      const { stdout } = await execAsync(`${mescPath} ${args.join(" ")}`);
      return stdout.trim();
    } catch (error) {
      // If mesc is not available or no endpoint found, fall back to default
      console.error("Error resolving MESC URL:", error);
      return rpcUrl || DEFAULT_RPC_URL;
    }
  }
  return rpcUrl || DEFAULT_RPC_URL;
}

 
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
    
    // Check if we need to format the output better
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
    let command = `${castPath} send ${contractAddress} "${functionSignature}"`;
    
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

// Tool: Encode function data
server.tool(
  "cast_abi_encode",
  "Encode function arguments according to the ABI",
  {
    signature: z.string().describe("Function signature (e.g., 'transfer(address,uint256)')"),
    args: z.array(z.string()).optional().describe("Function arguments")
  },
  async ({ signature, args = [] }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    let command = `${castPath} abi-encode "${signature}"`;
    
    if (args.length > 0) {
      command += " " + args.join(" ");
    }
    
    const result = await executeCommand(command);
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `ABI encoded data: ${result.message.trim()}` 
          : `Encoding failed: ${result.message}` 
      }],
      isError: !result.success
    };
  }
);

// Tool: Decode ABI-encoded data
server.tool(
  "cast_abi_decode",
  "Decode ABI-encoded data",
  {
    data: z.string().describe("ABI-encoded data"),
    types: z.array(z.string()).describe("Output types (e.g., 'address uint256')")
  },
  async ({ data, types }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    const command = `${castPath} abi-decode "${data}" "${types.join(' ')}"`;
    
    const result = await executeCommand(command);
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `Decoded data: ${result.message.trim()}` 
          : `Decoding failed: ${result.message}` 
      }],
      isError: !result.success
    };
  }
);

// Tool: Get contract ABI
server.tool(
  "cast_4byte",
  "Lookup and decode function selector or event signatures",
  {
    selector: z.string().describe("Function selector (0x + 4 bytes) or event topic (0x + 32 bytes)"),
  },
  async ({ selector }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    const command = `${castPath} 4byte ${selector}`;
    
    const result = await executeCommand(command);
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `Signature lookup for ${selector}:\n${result.message.trim()}` 
          : `Signature lookup failed: ${result.message}` 
      }],
      isError: !result.success
    };
  }
);

// Tool: Compute the storage slot for a mapping
server.tool(
  "cast_compute_slot",
  "Compute the storage slot for a mapping with given key",
  {
    slot: z.string().describe("Storage slot of the mapping"),
    key: z.string().describe("Key in the mapping"),
    keyType: z.string().optional().describe("The key type (default: address)")
  },
  async ({ slot, key, keyType = "address" }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    let command = `${castPath} compute-slot ${slot} ${key}`;
    
    if (keyType) {
      command += ` ${keyType}`;
    }
    
    const result = await executeCommand(command);
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `Storage slot for mapping[${key}] at slot ${slot} (key type: ${keyType}):\n${result.message.trim()}` 
          : `Computation failed: ${result.message}` 
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

// Tool: Decode transaction data
server.tool(
  "cast_tx",
  "Get information about a transaction",
  {
    txHash: z.string().describe("Transaction hash"),
    rpcUrl: z.string().optional().describe("JSON-RPC URL (default: http://localhost:8545)"),
    field: z.string().optional().describe("Specific transaction field to extract"),
  },
  async ({ txHash, rpcUrl, field }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    const resolvedRpcUrl = await resolveRpcUrl(rpcUrl);
    let command = `${castPath} tx ${txHash}`;
    
    if (resolvedRpcUrl) {
      command += ` --rpc-url "${resolvedRpcUrl}"`;
    }
    
    if (field) {
      command += ` ${field}`;
    }
    
    const result = await executeCommand(command);
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `Transaction ${txHash}${field ? ` (${field})` : ""}:\n${result.message}` 
          : `Failed to get transaction: ${result.message}` 
      }],
      isError: !result.success
    };
  }
);

// Tool: Decode calldata
server.tool(
  "cast_calldata",
  "Parse calldata and decode it according to the given signature",
  {
    calldata: z.string().describe("The calldata to parse"),
    signature: z.string().optional().describe("The function signature (e.g., 'transfer(address,uint256)')")
  },
  async ({ calldata, signature }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    let command = `${castPath} calldata`;
    
    if (signature) {
      command += ` "${signature}" ${calldata}`;
    } else {
      command += ` ${calldata}`;
    }
    
    const result = await executeCommand(command);
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `Decoded calldata${signature ? ` for ${signature}` : ""}:\n${result.message}` 
          : `Failed to decode calldata: ${result.message}` 
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
    verbosity: z.string().optional().describe("Trace verbosity level. (eg: vv for basic and vvvvv for max)"),
    debug: z.boolean().optional().describe("Open the transaction in the debugger"),
    labels: z.array(z.string()).optional().describe("Label addresses in the trace (format: <address>:<label>)")
  },
  async ({ txHash, rpcUrl, quick = false, verbosity = "vvv", debug = false, labels = [] }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    try {
      const resolvedRpcUrl = await resolveRpcUrl(rpcUrl);
      let command = `${castPath} run ${txHash}`;
      
      if (resolvedRpcUrl) {
        command += ` --rpc-url "${resolvedRpcUrl}"`;
      }
      
      if (quick) {
        command += " --quick";
      }
      
      if (verbosity) {
        command +=  ` -${verbosity}`;
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
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error running transaction: ${error}` }],
        isError: true
      };
    }
  }
);

// Tool: Generate transaction to call a function
server.tool(
  "cast_send_tx",
  "Generate and optionally broadcast a transaction",
  {
    to: z.string().describe("Recipient address"),
    data: z.string().optional().describe("Calldata (hex string)"),
    value: z.string().optional().describe("Ether value in wei"),
    from: z.string().optional().describe("Sender address or private key"),
    rpcUrl: z.string().optional().describe("JSON-RPC URL (default: http://localhost:8545)"),
    nonce: z.number().optional().describe("Nonce for the transaction"),
    gasLimit: z.string().optional().describe("Gas limit for the transaction"),
    gasPrice: z.string().optional().describe("Gas price in wei"),
    broadcast: z.boolean().optional().describe("Broadcast the transaction")
  },
  async ({ to, data, value, from, rpcUrl, nonce, gasLimit, gasPrice, broadcast = false }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    const resolvedRpcUrl = await resolveRpcUrl(rpcUrl);
    let command = broadcast ? `${castPath} send` : `${castPath} tx-create`;
    
    command += ` ${to}`;
    
    if (data) {
      command += ` ${data}`;
    }
    
    if (value) {
      command += ` --value ${value}`;
    }
    
    if (from) {
      command += ` --from ${from}`;
    }
    
    if (resolvedRpcUrl) {
      command += ` --rpc-url "${resolvedRpcUrl}"`;
    }
    
    if (nonce !== undefined) {
      command += ` --nonce ${nonce}`;
    }
    
    if (gasLimit) {
      command += ` --gas-limit ${gasLimit}`;
    }
    
    if (gasPrice) {
      command += ` --gas-price ${gasPrice}`;
    }
    
    const result = await executeCommand(command);
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `${broadcast ? "Transaction sent" : "Transaction created"}:\n${result.message}` 
          : `${broadcast ? "Transaction failed" : "Transaction creation failed"}: ${result.message}` 
      }],
      isError: !result.success
    };
  }
);

// Tool: Get block information
server.tool(
  "cast_block",
  "Get information about a block",
  {
    blockNumber: z.string().describe("Block number or hash (can use 'latest', 'earliest', etc.)"),
    rpcUrl: z.string().optional().describe("JSON-RPC URL (default: http://localhost:8545)"),
    field: z.string().optional().describe("Specific block field to extract"),
  },
  async ({ blockNumber, rpcUrl, field }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: FOUNDRY_NOT_INSTALLED_ERROR }],
        isError: true
      };
    }

    const resolvedRpcUrl = await resolveRpcUrl(rpcUrl);
    let command = `${castPath} block ${blockNumber}`;
    
    if (resolvedRpcUrl) {
      command += ` --rpc-url "${resolvedRpcUrl}"`;
    }
    
    if (field) {
      command += ` ${field}`;
    }
    
    const result = await executeCommand(command);
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `Block ${blockNumber}${field ? ` (${field})` : ""}:\n${result.message}` 
          : `Failed to get block info: ${result.message}` 
      }],
      isError: !result.success
    };
  }
);


async function startServer() {
  const foundryInstalled = await checkFoundryInstalled();
  if (!foundryInstalled) {
    console.error("Warning: Foundry tools are not installed. Some functionality may be limited.");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Foundry MCP Server started on stdio");
}

startServer().catch((error) => {
  console.error("Error starting server:", error);
  process.exit(1);
});
