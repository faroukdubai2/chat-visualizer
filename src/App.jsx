import React, { useState, useEffect, useCallback, useMemo } from 'react';
// Using lucide-react icons for visual elements
import { User, Bot, MessageSquare, CornerDownRight, Settings } from 'lucide-react';

// --- 1. UTILITIES & MOCK DATA (Simulated Server Logic) ---

// Utility for creating UUIDs
const generateId = () => `node_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// Utility: Heuristic JSON parser (simplified from backend)
function parseMessagesFromJson(json) {
  if (json.chatId && json.linear_conversation) {
    const messages = [];
    for (const item of json.linear_conversation) {
        if (item.message && item.message.content) {
            const role = item.message.author.role;
            const contentParts = item.message.content.parts;
            const content = contentParts.map(p => typeof p === 'string' ? p : '...').join('\n\n');
            if (role !== 'system' && content.trim()) {
                messages.push({
                    // Use item.id (the wrapper ID) consistently for reliable lookups
                    id: item.id || generateId(), 
                    role: role.toLowerCase() === 'user' ? 'user' : 'assistant',
                    content: content,
                    parent_id: item.parent || null
                });
            }
        }
    }
    return messages.length > 1 ? messages : null;
  }
  return null;
}

// ---------------------------------------------------------------------
// UPDATED MOCK BACKEND DATA TO REFLECT A COMPLEX, BRANCHING CONVERSATION
// This simulates the actual complex data structure we expect from a real chat transcript,
// demonstrating a branching trip planning discussion.
// ---------------------------------------------------------------------
const COMPLEX_BRANCHING_CHAT_DATA = {
  chatId: "chatcmpl-USER_REQUESTED_FLOW",
  title: "Italy Trip Planning Flow",
  linear_conversation: [
    // Message 1 (Root)
    { id: "message_1", message: { id: "m1", author: { role: "user" }, content: { parts: ["Help me plan a 7-day family trip to Italy, focusing on historical sites and food."] } }, parent: null }, 
    // Message 2 (Main Thread - Proposing Options)
    { id: "message_2", message: { id: "m2", author: { role: "assistant" }, content: { parts: ["We can split the week between Rome (history) and Florence (art/food). Which kind of accommodation: A. Budget/Airbnbs or B. Luxury/Hotels?"] } }, parent: "message_1" }, 
    
    // --- BRANCH A (Budget Option) ---
    // Message 3
    { id: "message_3", message: { id: "m3", author: { role: "user" }, content: { parts: ["A. Let's look at budget accommodation options in Rome first."] } }, parent: "message_2" }, 
    // Message 4 (Continuation of Branch A)
    { id: "message_4", message: { id: "m4", author: { role: "assistant" }, content: { parts: ["For Rome, consider the Trastevere area for Airbnbs. Focus on the Colosseum and Vatican on days 1 & 2."] } }, parent: "message_3" }, 
    
    // --- BRANCH B (Luxury Option, branches from M2) ---
    // Message 5
    { id: "message_5", message: { id: "m5", author: { role: "user" }, content: { parts: ["B. What luxury hotels are best in Florence and what's the cost?"] } }, parent: "message_2" },
    // Message 6 (Continuation of Branch B)
    { id: "message_6", message: { id: "m6", author: { role: "assistant" }, content: { parts: ["The Portrait Firenze offers amazing views. Days 5 & 6 should cover the Uffizi Gallery and Duomo."] } }, parent: "message_5" },
    
    // --- BRANCH C (Deep Dive on Vatican, branches from M4) ---
    // Message 7
    { id: "message_7", message: { id: "m7", author: { role: "user" }, content: { parts: ["How do I book skip-the-line tickets for the Vatican and what's the best time to go?"] } }, parent: "message_4" },
    // Message 8 (Continuation of Branch C)
    { id: "message_8", message: { id: "m8", author: { role: "assistant" }, content: { parts: ["Always use the official Vatican website, and book at least a month in advance for the 8:00 AM slot."] } }, parent: "message_7" }
  ],
};


/**
 * Simulates the server-side fetch and parsing logic.
 * NOTE: Due to sandbox limitations, live external fetches are not allowed. 
 * We use the COMPLEX_BRANCHING_CHAT_DATA to simulate the result of fetching a real, 
 * complex chat transcript when a valid-looking URL is provided.
 */
async function mockFetchAndParse(url) {
  await new Promise(resolve => setTimeout(resolve, 300)); // Simulate minimal network latency

  const isMockUrl = url.includes('chat.openai.com/share/') || url.includes('chatgpt.com/share/');

  if (isMockUrl) {
    // Return the complex simulated data instead of attempting an illegal external fetch.
    const messages = parseMessagesFromJson(COMPLEX_BRANCHING_CHAT_DATA);
    if (messages) return { messages, meta: { source: url, messageCount: messages.length, parser: 'ChatGPT Specialized' } };
  }

  return { error: 'Failed to fetch or parse URL. This demo uses internal mock data only.' };
}


const NODE_SIZE = 100; // Increased size for circular design
const X_SPACING = 350;
const Y_SPACING = 200;

/**
 * Converts messages list to Nodes and Edges with explicit positional data.
 */
function buildFlowFromMessages(messages) {
  const nodes = [];
  const nodeMap = new Map(messages.map(m => [m.id, m]));
  const positions = new Map(); // Store coordinates by ID
  const branchTracker = new Map(); // Tracks the next Y offset for branches off a parent ID

  let linearY = 150; // Starting Y position for the main thread

  // Pre-calculate the depth (X position) of each message
  const depthMap = new Map();
  function getDepth(id) {
    if (depthMap.has(id)) return depthMap.get(id);
    const msg = nodeMap.get(id);
    if (!msg || !msg.parent_id) {
        depthMap.set(id, 0);
        return 0;
    }
    const depth = getDepth(msg.parent_id) + 1;
    depthMap.set(id, depth);
    return depth;
  }
  
  messages.forEach(m => getDepth(m.id));
  
  // --- PASS 1: Calculate all Nodes and Initial Positions ---
  messages.forEach((m) => {
      const parentId = m.parent_id || 'root';
      const depth = depthMap.get(m.id);
      
      let x, y;

      if (depth === 0) {
          // First message (Root)
          x = 100;
          y = linearY;
          linearY += Y_SPACING;
          
      } else {
          // Get parent's *initial* position (which should exist due to message sorting/depth calculation)
          const parentPos = positions.get(parentId); 
          
          // Safety check (should be rare with fixed ID logic)
          if (!parentPos) {
              console.error("Parent position not found, falling back to basic linear layout for safety.");
              x = 100 + depth * X_SPACING;
              y = linearY;
              linearY += Y_SPACING;
          } else {
              
              if (!branchTracker.has(parentId)) {
                  branchTracker.set(parentId, { lastY: parentPos.y, offset: 0 });
              }
              
              let tracker = branchTracker.get(parentId);
              
              // X position is based on depth
              x = 100 + depth * X_SPACING;

              // Y position: Start slightly below the parent Y-center, and spread outwards
              // Find the first message that has this parent, which should be the linear continuation
              const isLinearContinuation = m.id === messages.find(msg => msg.parent_id === parentId)?.id;
              
              if (isLinearContinuation && depth < 2) {
                  // Keep linear progression for first depth level for clean main thread
                  y = tracker.lastY + Y_SPACING;
                  tracker.lastY = y;
              } else {
                  // Branching: offset Y to create distinct rows for branches
                  // Use a fixed spread for visual separation
                  tracker.offset += (m.role === 'user' ? 80 : 150) * (tracker.offset % 2 === 0 ? 1 : -1);
                  y = parentPos.y + tracker.offset;
                  tracker.lastY = y;
              }

              branchTracker.set(parentId, tracker);
          }
      }
      
      positions.set(m.id, { x, y }); // Store position reference
      
      // Create a basic node object without final position yet
      nodes.push({ 
          id: m.id,
          data: {
              role: m.role,
              content: m.content,
              createdAt: m.createdAt || new Date().toISOString(),
              step: nodes.length + 1,
          },
      });
  });

  // --- ADJUSTMENT PASS: Re-center all positions and update nodes ---
  const minY = Math.min(...Array.from(positions.values()).map(p => p.y));
  const adjustment = 100 - minY;
  
  // Apply adjustment to positions map and copy to nodes array
  nodes.forEach(node => {
      const pos = positions.get(node.id);
      pos.y += adjustment; // Modify the position object in the map
      node.position = pos; // Add the final, adjusted position object to the node
  });


  // --- PASS 2: Create Edges using finalized positions ---
  const edges = [];
  messages.forEach((m) => {
      const parentId = m.parent_id;
      
      if (parentId && nodeMap.has(parentId)) {
          const sourcePos = positions.get(parentId);
          const targetPos = positions.get(m.id);
          
          if (sourcePos && targetPos) { // Now guaranteed to exist and have {x, y}
            edges.push({
                id: `e${parentId}-${m.id}`,
                source: parentId,
                target: m.id,
                isUserMessage: m.role === 'user',
                sourcePos: sourcePos,
                targetPos: targetPos
            });
          }
      }
  });

  return { nodes, edges, positions };
}


// --- 2. RENDER COMPONENTS (Custom, dependency-free) ---

const ChatNode = ({ node }) => {
  const { data, position } = node;
  const isUser = (data.role || '').toLowerCase().includes('user');
  const roleName = isUser ? 'User' : 'Assistant';
  
  const IconComponent = isUser ? User : Bot;
  const colorClass = isUser ? 'bg-indigo-600' : 'bg-green-600';
  const shadowColor = isUser ? 'shadow-indigo-400/50' : 'shadow-green-400/50';

  const nodeStyle = {
    position: 'absolute',
    left: position.x,
    top: position.y,
    zIndex: 10,
    width: NODE_SIZE,
    height: NODE_SIZE + 50, // Added space for label
    transform: 'translate(-50%, -50%)', // Center the node based on its X/Y coordinates
  };

  return (
    <div style={nodeStyle} className="flex flex-col items-center">
        {/* The circular icon part */}
        <div className={`w-[${NODE_SIZE}px] h-[${NODE_SIZE}px] rounded-full flex items-center justify-center text-white shadow-2xl ring-4 ring-white relative transition-transform hover:scale-105 ${colorClass} ${shadowColor}`}>
            <IconComponent size={40} />
            {/* Step Counter (Top Right) */}
            <div className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-white text-gray-700 text-xs font-bold flex items-center justify-center shadow-md">
                {data.step}
            </div>
        </div>

        {/* Label and Subtext (Snippet) */}
        <div className="mt-3 text-center w-40">
            <p className="font-semibold text-sm text-gray-800">{roleName}</p>
            <p className="text-xs text-gray-500 line-clamp-2 italic">
                "{String(data.content).slice(0, 30)}{String(data.content).length > 30 ? '…' : ''}"
            </p>
        </div>
    </div>
  );
};


// Component for drawing Bezier Curves and adding labels
const BezierEdge = ({ edge }) => {
    // sourcePos and targetPos are now guaranteed to exist due to the two-pass logic
    const { sourcePos, targetPos, isUserMessage } = edge;

    if (!sourcePos || !targetPos) return null; // Safety check remains

    // Source (Right edge of source circle)
    const sx = sourcePos.x + NODE_SIZE / 2;
    const sy = sourcePos.y;

    // Target (Left edge of target circle)
    const tx = targetPos.x - NODE_SIZE / 2;
    const ty = targetPos.y;

    // Control points for the Bezier curve
    const midX = sx + (tx - sx) / 2;
    const cpx1 = sx + 50;
    const cpy1 = sy;
    const cpx2 = tx - 50;
    const cpy2 = ty;
    
    // Path string: Move to Source, then Bezier curve to Target
    const d = `M ${sx} ${sy} C ${cpx1} ${cpy1}, ${cpx2} ${cpy2}, ${tx} ${ty}`;

    const color = isUserMessage ? '#9CA3AF' : '#10B981'; // Gray for user connection, Green for Assistant connection
    const strokeDasharray = '5 5'; // Dotted line style

    // Midpoint for label placement (approx)
    const labelX = midX;
    const labelY = (sy + ty) / 2;
    
    // Determine branch type for conditional icon
    // Note: Since the positions are now calculated safely, we can rely on the Y difference for branching
    const isBranch = Math.abs(targetPos.y - sourcePos.y) > (Y_SPACING * 0.75);

    return (
        <g>
            {/* The main curved, dotted line */}
            <path d={d} stroke={color} fill="none" strokeWidth="3" strokeDasharray={strokeDasharray} markerEnd="url(#arrowhead)" />
            
            {/* Branching Icon (Wrench/Settings) */}
            {isBranch && (
                <foreignObject x={labelX - 10} y={labelY - 30} width="20" height="20" className="pointer-events-none">
                     <Settings size={16} className="text-yellow-600 bg-white rounded-full p-0.5 shadow-md" />
                </foreignObject>
            )}
        </g>
    );
};


// --- 3. MAIN APP COMPONENT ---

const DEFAULT_URL_PROMPT = 'https://chatgpt.com/share/68fd3603-9e98-800a-ad82-3822c7842b56';

export default function App() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [nodePositions, setNodePositions] = useState(new Map());
  const [chatUrl, setChatUrl] = useState(DEFAULT_URL_PROMPT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [messageCount, setMessageCount] = useState(0);

  const handleGenerateFlow = useCallback(async (url) => {
    if (!url) return;
    setLoading(true);
    setError(null);
    setMessageCount(0);
    setNodes([]);
    setEdges([]);
    setNodePositions(new Map());

    try {
      // SIMULATED BACKEND CALL (uses internal mock data)
      const result = await mockFetchAndParse(url);
      
      if (result.error) {
        setError(result.error);
      } else {
        const { nodes, edges, positions } = buildFlowFromMessages(result.messages);
        setNodes(nodes);
        setEdges(edges);
        setNodePositions(positions);
        setMessageCount(result.meta.messageCount);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load effect
  useEffect(() => {
    // Only automatically load if the default prompt URL is still active and no nodes are loaded
    if (nodes.length === 0 && chatUrl === DEFAULT_URL_PROMPT) {
      handleGenerateFlow(DEFAULT_URL_PROMPT);
    }
  }, [handleGenerateFlow, nodes.length, chatUrl]);

  // Calculate the required dimensions for the visualization container
  const { flowWidth, flowHeight } = useMemo(() => {
    let maxX = 0;
    let maxY = 0;
    nodes.forEach(node => {
        // Calculate based on node center + half size + padding
        if (node.position.x + NODE_SIZE / 2 + 50 > maxX) maxX = node.position.x + NODE_SIZE / 2 + 50;
        if (node.position.y + NODE_SIZE / 2 + 50 > maxY) maxY = node.position.y + NODE_SIZE / 2 + 50;
    });

    return {
        flowWidth: Math.max(800, maxX),
        flowHeight: Math.max(400, maxY)
    };
  }, [nodes]);


  return (
    <div className="p-4 h-screen bg-gray-50 flex flex-col font-sans antialiased">
      <script src="https://cdn.tailwindcss.com"></script>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap');
        .font-sans { font-family: 'Inter', sans-serif; }
      `}</style>
      
      <h1 className="text-3xl font-bold mb-4 text-gray-800">
        Chat Conversation Flow Visualizer
      </h1>
      <p className="text-gray-600 mb-6">
        Paste a public ChatGPT URL to see how the conversation branched and developed, using a visual style similar to a workflow diagram.
      </p>

      {/* Input and Action Area */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6 p-4 bg-white rounded-xl shadow-lg border">
        <input
          type="text"
          placeholder="Enter Chat Transcript URL (e.g., https://chat.openai.com/share/...)"
          value={chatUrl}
          onChange={(e) => setChatUrl(e.target.value)}
          className="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
          disabled={loading}
        />
        <button
          onClick={() => handleGenerateFlow(chatUrl)}
          disabled={loading || !chatUrl.trim()}
          className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition duration-150 ease-in-out disabled:bg-indigo-400 disabled:cursor-not-allowed"
        >
          {loading ? 'Parsing...' : 'Visualize Flow'}
        </button>
      </div>

      {/* Status and Flow Area */}
      <div className="flex-grow bg-white rounded-xl shadow-xl overflow-auto p-4 relative border-2 border-gray-200">
        
        {loading && (
             <div className="absolute inset-0 flex justify-center items-center bg-white bg-opacity-70 z-20">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent"></div>
                <span className="ml-4 text-indigo-600 font-medium">Parsing and Laying Out Nodes...</span>
             </div>
        )}

        {error && (
          <div className="p-4 bg-red-100 text-red-700 rounded-lg text-sm font-medium">
            Error: {error}
          </div>
        )}
        
        {!loading && nodes.length === 0 && !error && (
             <div className="absolute inset-0 flex justify-center items-center bg-white bg-opacity-70 z-20">
                <span className="ml-4 text-gray-500 font-medium">Paste a URL and click 'Visualize Flow' to begin.</span>
             </div>
        )}

        {/* Visualization Canvas - Relative Container */}
        <div style={{ position: 'relative', width: flowWidth, height: flowHeight, minWidth: '100%' }}>
            
            {/* SVG Overlay for Edges */}
            <svg style={{ position: 'absolute', top: 0, left: 0, width: flowWidth, height: flowHeight }}>
                <defs>
                    {/* Arrowhead Marker */}
                    <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="10" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L10,3 L0,6 L3,3 z" fill="#10B981" /> {/* Green arrow for connection */}
                    </marker>
                </defs>
                {edges.map(edge => (
                    // Using a simple line connection between centers of the circular nodes for this layout
                    <BezierEdge key={edge.id} edge={edge} />
                ))}
            </svg>

            {/* HTML Nodes (Absolute Positioned) */}
            {nodes.map(node => (
                <ChatNode key={node.id} node={node} />
            ))}

        </div>

        {nodes.length > 0 && (
            <div className="absolute bottom-4 left-4 p-2 bg-gray-100 rounded-lg shadow-md text-sm">
                <span className="font-semibold text-indigo-600">{messageCount}</span> Messages Parsed | <span className="font-semibold">{edges.length}</span> Connections
            </div>
        )}

      </div>
    </div>
  );
}
