<?php
/**
 * MAGGIE - MemoryKeep Neural Database Interface
 * Sophisticated Neural Interface for Hostinger
 */
header('Content-Type: text/html; charset=utf-8');

// Identity tokens
$name = "MAGGIE";
$role = "Intelligent Liaison";
$version = "3.2.0";

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo $name; ?> | Neural Database</title>
    <style>
        :root {
            --bg: #0d0d12;
            --surface: rgba(26, 26, 36, 0.82);
            --accent: #0097b2;
            --accent-glow: rgba(0, 151, 178, 0.4);
            --text: #f6f6e9;
            --text-dim: rgba(246, 246, 233, 0.6);
            --glass-border: rgba(255, 255, 255, 0.1);
            --neon-green: #b5e48c;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            background-color: var(--bg);
            background-image: 
                radial-gradient(circle at 15% 15%, rgba(0, 151, 178, 0.12) 0%, transparent 45%),
                radial-gradient(circle at 85% 85%, rgba(181, 228, 140, 0.05) 0%, transparent 45%);
            color: var(--text);
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
        }

        .container {
            position: relative;
            background: var(--surface);
            backdrop-filter: blur(25px);
            padding: 50px 40px;
            border-radius: 28px;
            border: 1px solid var(--glass-border);
            text-align: center;
            box-shadow: 0 30px 60px rgba(0, 0, 0, 0.6);
            max-width: 480px;
            width: 90%;
            z-index: 10;
        }

        .status-header {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            margin-bottom: 25px;
        }

        .pulse {
            width: 10px;
            height: 10px;
            background: var(--neon-green);
            border-radius: 50%;
            box-shadow: 0 0 15px var(--neon-green);
            animation: pulse-glow 2.5s infinite ease-in-out;
        }

        @keyframes pulse-glow {
            0% { transform: scale(1); opacity: 1; box-shadow: 0 0 10px var(--neon-green); }
            50% { transform: scale(1.3); opacity: 0.7; box-shadow: 0 0 20px var(--neon-green); }
            100% { transform: scale(1); opacity: 1; box-shadow: 0 0 10px var(--neon-green); }
        }

        .status-text {
            font-size: 0.7rem;
            letter-spacing: 4px;
            font-weight: 600;
            color: var(--neon-green);
            text-transform: uppercase;
        }

        h1 {
            font-size: 3.2rem;
            font-weight: 300;
            letter-spacing: 10px;
            margin-bottom: 8px;
            color: var(--text);
            text-shadow: 0 0 25px rgba(255, 255, 255, 0.1);
        }

        .sub-title {
            font-size: 0.8rem;
            color: var(--accent);
            font-family: 'JetBrains Mono', monospace;
            letter-spacing: 3px;
            margin-bottom: 35px;
            text-transform: uppercase;
        }

        .info-panel {
            background: rgba(0, 0, 0, 0.25);
            border: 1px solid var(--glass-border);
            padding: 24px;
            border-radius: 16px;
            line-height: 1.9;
            font-size: 0.9rem;
            color: var(--text-dim);
            text-align: left;
        }

        .info-panel strong {
            color: var(--text);
            font-weight: 500;
            margin-left: 4px;
        }

        .db-tag {
            margin-top: 35px;
            display: inline-block;
            background: rgba(0, 151, 178, 0.08);
            border: 1px solid var(--accent);
            padding: 8px 20px;
            border-radius: 8px;
            font-size: 0.65rem;
            letter-spacing: 2px;
            color: var(--accent);
            text-transform: uppercase;
            font-weight: 600;
        }

        .bg-glow {
            position: absolute;
            width: 400px;
            height: 400px;
            background: var(--accent-glow);
            filter: blur(120px);
            border-radius: 50%;
            z-index: 1;
            pointer-events: none;
            opacity: 0.4;
        }
    </style>
</head>
<body>
    <div class="bg-glow"></div>
    <div class="container">
        <div class="status-header">
            <div class="pulse"></div>
            <span class="status-text">Neural Core Online</span>
        </div>
        
        <h1><?php echo $name; ?></h1>
        <div class="sub-title">Neural Database v<?php echo $version; ?></div>
        
        <div class="info-panel">
            Liaison Identity: <strong><?php echo $name; ?></strong><br>
            Cognitive Role: <strong><?php echo $role; ?></strong><br>
            Neural Protocol: <strong>MemoryKeep MK3</strong><br>
            DB Connectivity: <strong>Enabled (MySQL Wired)</strong>
        </div>
        
        <div class="db-tag">Hostinger Interface Linked</div>
    </div>
</body>
</html>
