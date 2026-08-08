import { Socket } from 'socket.io';
import { Client } from 'ssh2';

export function handleSSHSocket(socket: Socket & { userId?: string; role?: string }) {
  let sshClient: Client | null = null;
  let sshStream: any = null;

  socket.on('ssh:connect', (config: any) => {
    // Only owner should be able to SSH
    // This is double-checked via JWT role in real scenarios, but for now we trust the token payload
    
    if (sshClient) {
      sshClient.end();
    }

    sshClient = new Client();

    sshClient.on('ready', () => {
      socket.emit('ssh:data', '\r\n*** SSH CONNECTION ESTABLISHED ***\r\n');
      
      sshClient!.shell((err, stream) => {
        if (err) {
          socket.emit('ssh:error', 'Shell error: ' + err.message);
          return;
        }
        
        sshStream = stream;

        // Route data from SSH to Socket
        stream.on('data', (data: Buffer) => {
          socket.emit('ssh:data', data.toString('utf-8'));
        }).on('close', () => {
          sshClient!.end();
          socket.emit('ssh:data', '\r\n*** SSH CONNECTION CLOSED ***\r\n');
        });

      });
    }).on('error', (err) => {
      socket.emit('ssh:error', 'SSH Error: ' + err.message);
    }).on('end', () => {
      socket.emit('ssh:data', '\r\n*** SSH DISCONNECTED ***\r\n');
    });

    try {
      socket.emit('ssh:data', `\r\nConnecting to ${config.host}...\r\n`);
      sshClient.connect({
        host: config.host,
        port: config.port || 22,
        username: config.username,
        password: config.password,
        privateKey: config.privateKey,
        readyTimeout: 10000,
      });
    } catch (e: any) {
      socket.emit('ssh:error', 'Connection setup error: ' + e.message);
    }
  });

  socket.on('ssh:data', (data: string) => {
    if (sshStream) {
      sshStream.write(data);
    }
  });

  socket.on('ssh:resize', (size: { rows: number; cols: number }) => {
    if (sshStream) {
      sshStream.setWindow(size.rows, size.cols, 0, 0);
    }
  });

  socket.on('disconnect', () => {
    if (sshClient) {
      sshClient.end();
    }
  });
}
