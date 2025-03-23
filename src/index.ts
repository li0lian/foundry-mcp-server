import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import * as dotenv from 'dotenv';
dotenv.config();

const execAsync = promisify(exec);

const server = new McpServer({
  name: "Foundry MCP Server",
  version: "0.1.0"
});

const castPath = process.env.HOME + "/.foundry/bin/cast";
const forgePath = process.env.HOME + "/.foundry/bin/forge";
const chiselPath = process.env.HOME + "/.foundry/bin/chisel";
const anvilPath = process.env.HOME + "/.foundry/bin/anvil";

const errorMessage = "Foundry tools are not installed. Please install Foundry: https://book.getfoundry.sh/getting-started/installation";

async function checkFoundryInstalled() {
  try {
    await execAsync(`${forgePath} --version`);
    return true;
  } catch (error) {
    console.error("checkFoundryInstalled", error);
    return false;
  }
}


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

// Tool: Call a contract function (read-only)
server.tool(
  "cast_call",
  "Call a contract function (read-only)",
  {
    contractAddress: z.string().describe("Address of the contract"),
    functionSignature: z.string().describe("Function signature (e.g., 'balanceOf(address)')"),
    args: z.array(z.string()).optional().describe("Function arguments"),
    rpcUrl: z.string().optional().describe("JSON-RPC URL (default: http://localhost:8545)"),
    blockNumber: z.string().optional().describe("Block number (e.g., 'latest', 'earliest', or a number)")
  },
  async ({ contractAddress, functionSignature, args = [], rpcUrl, blockNumber }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: errorMessage }],
        isError: true
      };
    }

    let command = `${castPath} call ${contractAddress} "${functionSignature}"`;
    
    if (args.length > 0) {
      command += " " + args.join(" ");
    }
    
    if (rpcUrl) {
      command += ` --rpc-url "${rpcUrl}"`;
    }
    
    if (blockNumber) {
      command += ` --block ${blockNumber}`;
    }
    
    const result = await executeCommand(command);
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `Call result:\n${result.message}` 
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
    gasLimit: z.string().optional().describe("Gas limit for the transaction")
  },
  async ({ contractAddress, functionSignature, args = [], from, value, rpcUrl, gasLimit }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: errorMessage }],
        isError: true
      };
    }

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
    
    if (rpcUrl) {
      command += ` --rpc-url "${rpcUrl}"`;
    }
    
    if (gasLimit) {
      command += ` --gas-limit ${gasLimit}`;
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
    blockNumber: z.string().optional().describe("Block number (e.g., 'latest', 'earliest', or a number)")
  },
  async ({ address, rpcUrl, blockNumber }) => {
    const installed = await checkFoundryInstalled();
    if (!installed) {
      return {
        content: [{ type: "text", text: "" }],
        isError: true
      };
    }

    let command = `${castPath} balance ${address}`;
    
    if (rpcUrl) {
      command += ` --rpc-url "${rpcUrl}"`;
    }
    
    if (blockNumber) {
      command += ` --block ${blockNumber}`;
    }
    
    const result = await executeCommand(command);
    
    return {
      content: [{ 
        type: "text", 
        text: result.success 
          ? `Balance of ${address}: ${result.message.trim()} wei` 
          : `Failed to get balance: ${result.message}` 
      }],
      isError: !result.success
    };
  }
);

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
        content: [{ type: "text", text: errorMessage }],
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
        content: [{ type: "text", text: errorMessage }],
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