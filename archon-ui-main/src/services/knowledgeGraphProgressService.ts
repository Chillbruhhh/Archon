/**
 * Knowledge Graph Parsing Progress Service
 * 
 * Uses Socket.IO for real-time knowledge graph parsing progress updates,
 * automatic reconnection, and improved connection management.
 */

import { knowledgeSocketIO, WebSocketService } from './socketIOService';
import { ParsingProgress } from './knowledgeGraphService';

// Define types for parsing progress specific to Knowledge Graph
export interface KGParsingStep {
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  percentage: number;
  message?: string;
  duration?: number;
}

export interface KGParsingProgressData {
  parsingId: string;
  status: 'starting' | 'cloning' | 'parsing' | 'analyzing' | 'completed' | 'failed' | 'cancelled';
  percentage: number;
  currentStep?: string;
  currentFile?: string;
  totalFiles?: number;
  processedFiles?: number;
  nodesCreated?: number;
  relationshipsCreated?: number;
  errors?: string[];
  message?: string;
  completed?: boolean;
  // Performance metrics
  performance?: {
    filesPerSecond: number;
    averageFileSize: number;
    memoryUsage: number;
  };
  // Timing information
  startTime?: string;
  estimatedCompletion?: string;
  estimatedTimeRemaining?: number;
  // Repository information
  repositoryName?: string;
  repositoryUrl?: string;
  branch?: string;
  languages?: string[];
  // Results
  kg_source_id?: string;
  kg_repository_id?: string;
  statistics?: Record<string, any>;
}

// 8-step parsing process for Knowledge Graph
export const KG_PARSING_STEPS: KGParsingStep[] = [
  { name: 'Repository Setup', status: 'pending', percentage: 0 },
  { name: 'Code Cloning', status: 'pending', percentage: 12.5 },
  { name: 'File Discovery', status: 'pending', percentage: 25 },
  { name: 'AST Parsing', status: 'pending', percentage: 40 },
  { name: 'Node Extraction', status: 'pending', percentage: 60 },
  { name: 'Relationship Analysis', status: 'pending', percentage: 80 },
  { name: 'Graph Construction', status: 'pending', percentage: 90 },
  { name: 'Finalization', status: 'pending', percentage: 100 }
];

interface StreamProgressOptions {
  autoReconnect?: boolean;
  reconnectDelay?: number;
  connectionTimeout?: number;
}

type ProgressCallback = (data: KGParsingProgressData) => void;

class KnowledgeGraphProgressService {
  private wsService: WebSocketService = knowledgeSocketIO;
  private activeSubscriptions: Map<string, () => void> = new Map();
  private messageHandlers: Map<string, ProgressCallback> = new Map();
  private isConnected: boolean = false;

  /**
   * Stream knowledge graph parsing progress with Socket.IO
   */
  async streamProgress(
    parsingId: string,
    onMessage: ProgressCallback,
    options: StreamProgressOptions = {}
  ): Promise<void> {
    console.log(`🧠 Starting Socket.IO KG parsing progress stream for ${parsingId}`);

    try {
      // Ensure we're connected to Socket.IO
      if (!this.wsService.isConnected()) {
        console.log('📡 Connecting to Socket.IO server for KG parsing...');
        await this.wsService.connect(`/kg-parsing-progress/${parsingId}`);
        console.log('✅ Connected to Socket.IO server for KG parsing');
      }

      // Wait for connection to be fully established
      console.log('⏳ Waiting for KG parsing connection to be fully established...');
      await this.wsService.waitForConnection(10000);
      this.isConnected = this.wsService.isConnected();
      console.log(`✅ Socket.IO KG parsing connection verified, connected: ${this.isConnected}`);

      // Set up acknowledgment promise
      let subscriptionAcknowledged = false;
      const ackPromise = new Promise<void>((resolve, reject) => {
        const ackTimeout = setTimeout(() => {
          if (!subscriptionAcknowledged) {
            reject(new Error('KG parsing subscription acknowledgment timeout'));
          }
        }, 5000);

        // Listen for subscription acknowledgment
        const ackHandler = (message: any) => {
          const data = message.data || message;
          console.log(`📨 Received KG parsing acknowledgment:`, data);
          if (data.parsing_id === parsingId && data.status === 'subscribed') {
            console.log(`✅ KG parsing subscription acknowledged for ${parsingId}`);
            subscriptionAcknowledged = true;
            clearTimeout(ackTimeout);
            this.wsService.removeMessageHandler('kg_parsing_subscribe_ack', ackHandler);
            resolve();
          }
        };
        this.wsService.addMessageHandler('kg_parsing_subscribe_ack', ackHandler);
      });

      // Create a specific handler for this parsingId
      const progressHandler = (message: any) => {
        console.log(`📨 [${parsingId}] KG parsing raw message received:`, message);
        const data = message.data || message;
        console.log(`📨 [${parsingId}] KG parsing extracted data:`, data);
        
        // Only process messages for this specific parsingId
        if (data.parsingId === parsingId || data.parsing_id === parsingId) {
          console.log(`✅ [${parsingId}] KG parsing progress match! Processing message`);
          onMessage(data);
        } else {
          console.log(`❌ [${parsingId}] KG parsing ID mismatch: got ${data.parsingId || data.parsing_id}`);
        }
      };

      // Store the handler so we can remove it later
      this.messageHandlers.set(parsingId, progressHandler);

      // Add message handlers for KG parsing events
      this.wsService.addMessageHandler('kg_parsing_progress', progressHandler);
      this.wsService.addMessageHandler('kg_parsing_start', progressHandler);
      this.wsService.addMessageHandler('kg_parsing_update', progressHandler);

      // Handle completion events
      this.wsService.addMessageHandler('kg_parsing_complete', (message) => {
        const data = message.data || message;
        console.log(`✅ KG parsing completed for ${parsingId}`);
        if (data.parsingId === parsingId || data.parsing_id === parsingId) {
          onMessage({ 
            ...data, 
            completed: true,
            status: 'completed',
            percentage: 100
          });
        }
      });

      // Handle error events
      this.wsService.addMessageHandler('kg_parsing_error', (message) => {
        console.error(`❌ KG parsing error for ${parsingId}:`, message);
        const data = message.data || message;
        if (data.parsingId === parsingId || data.parsing_id === parsingId) {
          onMessage({ 
            parsingId,
            status: 'failed',
            error: data.message || data.error || 'Unknown parsing error',
            percentage: 0,
            completed: true
          });
        }
      });

      // Handle cancellation events
      this.wsService.addMessageHandler('kg_parsing_cancelled', (message) => {
        const data = message.data || message;
        if (data.parsingId === parsingId || data.parsing_id === parsingId) {
          onMessage({
            parsingId,
            status: 'cancelled',
            percentage: data.percentage || 0,
            completed: true,
            message: data.message || 'Parsing cancelled by user'
          });
          
          // Auto-cleanup after cancellation
          setTimeout(() => this.stopStreaming(parsingId), 1000);
        }
      });

      // Subscribe to the KG parsing progress
      console.log(`📤 Sending kg_parsing_subscribe for ${parsingId}`);
      const subscribeMessage = {
        type: 'kg_parsing_subscribe',
        data: { parsing_id: parsingId }
      };
      console.log('📤 KG parsing subscribe message:', JSON.stringify(subscribeMessage));
      
      // Send subscription with retry
      let sent = false;
      let retries = 0;
      while (!sent && retries < 3) {
        sent = this.wsService.send(subscribeMessage);
        if (!sent) {
          console.warn(`⚠️ Failed to send KG parsing subscription, retrying... (attempt ${retries + 1})`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          retries++;
        }
      }
      
      if (!sent) {
        throw new Error('Failed to send KG parsing subscription after 3 attempts');
      }
      
      console.log(`📤 KG parsing message sent successfully: ${sent}`);

      // Wait for acknowledgment
      try {
        await ackPromise;
        console.log(`✅ KG parsing subscription confirmed for ${parsingId}`);
      } catch (ackError) {
        console.error(`❌ KG parsing subscription acknowledgment failed:`, ackError);
        // Continue anyway - the subscription might still work
      }

      // Store cleanup function
      this.activeSubscriptions.set(parsingId, () => {
        this.stopStreaming(parsingId);
      });

    } catch (error) {
      console.error(`❌ Failed to start KG parsing progress stream for ${parsingId}:`, error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Stop streaming progress for a specific parsing ID
   */
  stopStreaming(parsingId: string): void {
    console.log(`🛑 Stopping KG parsing progress stream for ${parsingId}`);
    
    // Send unsubscribe message
    if (this.isConnected) {
      this.wsService.send({
        type: 'kg_parsing_unsubscribe',
        data: { parsing_id: parsingId }
      });
    }
    
    // Remove the specific handler for this parsingId
    const handler = this.messageHandlers.get(parsingId);
    if (handler) {
      this.wsService.removeMessageHandler('kg_parsing_progress', handler);
      this.wsService.removeMessageHandler('kg_parsing_start', handler);
      this.wsService.removeMessageHandler('kg_parsing_update', handler);
      this.messageHandlers.delete(parsingId);
    }
    
    // Remove from active subscriptions
    this.activeSubscriptions.delete(parsingId);
  }

  /**
   * Stop all active streams
   */
  stopAllStreams(): void {
    console.log('🛑 Stopping all KG parsing progress streams');
    
    // Stop each active subscription
    for (const [parsingId] of this.activeSubscriptions) {
      this.stopStreaming(parsingId);
    }
    
    // Clear all handlers
    this.messageHandlers.clear();
  }

  /**
   * Check if currently streaming for a parsing ID
   */
  isStreaming(parsingId: string): boolean {
    return this.activeSubscriptions.has(parsingId);
  }

  /**
   * Get connection state
   */
  getConnectionState(): boolean {
    return this.isConnected && this.wsService.isConnected();
  }

  /**
   * Manually trigger reconnection
   */
  async reconnect(): Promise<void> {
    console.log('🔄 Reconnecting to Socket.IO server for KG parsing...');
    this.isConnected = false;
    
    // Clear handlers and resubscribe
    console.warn('⚠️ KG parsing reconnect called - clearing handlers only, NOT disconnecting shared socket');
    
    // Resubscribe all active subscriptions
    const activeParsingIds = Array.from(this.activeSubscriptions.keys());
    if (activeParsingIds.length > 0) {
      console.log(`🔄 Resubscribing to ${activeParsingIds.length} active KG parsing streams...`);
      
      // Store handlers temporarily
      const tempHandlers = new Map(this.messageHandlers);
      
      // Clear current state
      this.activeSubscriptions.clear();
      this.messageHandlers.clear();
      
      // Reconnect and resubscribe
      for (const parsingId of activeParsingIds) {
        const handler = tempHandlers.get(parsingId);
        if (handler) {
          try {
            await this.streamProgress(parsingId, handler);
            console.log(`✅ Resubscribed to KG parsing ${parsingId}`);
          } catch (error) {
            console.error(`❌ Failed to resubscribe to KG parsing ${parsingId}:`, error);
          }
        }
      }
    }
  }

  /**
   * Enhanced stream progress with additional callbacks
   */
  async streamProgressEnhanced(
    parsingId: string,
    callbacks: {
      onMessage: ProgressCallback;
      onStateChange?: (state: any) => void;
      onError?: (error: any) => void;
    },
    options: StreamProgressOptions = {}
  ): Promise<void> {
    try {
      await this.streamProgress(parsingId, callbacks.onMessage, options);
      
      // Add state change handler if provided
      if (callbacks.onStateChange && this.wsService) {
        this.wsService.addStateChangeHandler(callbacks.onStateChange);
      }
      
      // Add error handler if provided
      if (callbacks.onError && this.wsService) {
        this.wsService.addErrorHandler(callbacks.onError);
      }
    } catch (error) {
      if (callbacks.onError) {
        callbacks.onError(error);
      }
      throw error;
    }
  }

  /**
   * Wait for connection to be established
   */
  async waitForConnection(timeout: number = 5000): Promise<void> {
    if (!this.wsService) {
      throw new Error('WebSocket service not initialized');
    }
    return this.wsService.waitForConnection(timeout);
  }

  /**
   * Disconnect the WebSocket service
   */
  disconnect(): void {
    console.log('🔌 Disconnecting KG parsing progress service');
    console.log(`📊 Active KG parsing subscriptions before cleanup: ${this.activeSubscriptions.size}`);
    console.log(`📊 Active KG parsing handlers before cleanup: ${this.messageHandlers.size}`);
    
    this.stopAllStreams();
    this.isConnected = false;
    
    // We don't disconnect the shared Socket.IO connection
    console.log('✅ Cleared KG parsing handlers without disconnecting shared Socket.IO instance');
    
    this.activeSubscriptions.clear();
    console.log('✅ KG parsing progress service cleanup complete - Socket.IO connection preserved');
  }

  /**
   * Convert parsing progress to display format with steps
   */
  getProgressSteps(progress: KGParsingProgressData): KGParsingStep[] {
    const steps = [...KG_PARSING_STEPS];
    
    // Update step statuses based on current progress
    steps.forEach((step, index) => {
      const stepPercentage = (index + 1) * (100 / steps.length);
      
      if (progress.percentage >= stepPercentage) {
        step.status = 'completed';
      } else if (progress.percentage >= stepPercentage - (100 / steps.length)) {
        step.status = 'in_progress';
        step.message = progress.currentStep || progress.message;
      } else {
        step.status = 'pending';
      }
      
      step.percentage = Math.min(stepPercentage, progress.percentage);
    });
    
    // Handle error states
    if (progress.status === 'failed') {
      const currentStepIndex = Math.floor(progress.percentage / (100 / steps.length));
      if (currentStepIndex < steps.length) {
        steps[currentStepIndex].status = 'failed';
        steps[currentStepIndex].message = progress.message || 'Step failed';
      }
    }
    
    return steps;
  }
}

// Export singleton instance
export const knowledgeGraphProgressService = new KnowledgeGraphProgressService();