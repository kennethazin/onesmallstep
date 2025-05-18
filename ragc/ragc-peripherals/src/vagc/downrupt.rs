use dsky_protocol::agc::generate_yaagc_packet;

use crossbeam_channel::{unbounded, Receiver, Sender};
use std::io::Write;
use std::net::TcpListener;

use ragc_core::mem::mods::AgcIoPeriph;

pub struct DownruptPeriph {
    tx: Sender<[u8; 4]>,
    word_order: bool,
}

fn downrupt_thread(rx: Receiver<[u8; 4]>, addr: &str) {
    // accept connections and process them serially
    let listener = TcpListener::bind(addr).unwrap();
    for stream in listener.incoming() {
        match stream {
            Ok(mut xa) => loop {
                let msg = match rx.recv() {
                    Ok(x) => x,
                    _ => {
                        break;
                    }
                };

                match xa.write_all(&msg) {
                    Ok(_x) => {}
                    _ => {
                        break;
                    }
                }
            },
            _ => {}
        };
    }
}

impl DownruptPeriph {
    pub fn new() -> Self {
        let (tx, rx) = unbounded();

        std::thread::spawn(move || downrupt_thread(rx, "127.0.0.1:19800"));
        DownruptPeriph {
            tx,
            word_order: false,
        }
    }
}

impl AgcIoPeriph for DownruptPeriph {
    fn read(&self, channel_idx: usize) -> u16 {
        match channel_idx {
            ragc_core::consts::io::CHANNEL_CHAN13 => {
                if self.word_order {
                    1 << 6
                } else {
                    0o00000
                }
            }
            ragc_core::consts::io::CHANNEL_CHAN30
            | ragc_core::consts::io::CHANNEL_CHAN31
            | ragc_core::consts::io::CHANNEL_CHAN32
            | ragc_core::consts::io::CHANNEL_CHAN33
            | ragc_core::consts::io::CHANNEL_CHAN34
            | ragc_core::consts::io::CHANNEL_CHAN35 => 0o77777,
            _ => 0o00000,
        }
    }
    fn write(&mut self, channel_idx: usize, value: u16) {
        match channel_idx {
            ragc_core::consts::io::CHANNEL_CHAN13 => {
                if value & (1 << 6) != 0o00000 {
                    self.word_order = true;
                } else {
                    self.word_order = false;
                }
            }
            ragc_core::consts::io::CHANNEL_CHAN34 => {
                let packet = generate_yaagc_packet(channel_idx, value);
                self.tx.send(packet).unwrap();
            }
            ragc_core::consts::io::CHANNEL_CHAN35 => {
                let packet = generate_yaagc_packet(channel_idx, value);
                self.tx.send(packet).unwrap();
            }
            _ => {}
        }
    }

    fn is_interrupt(&mut self) -> u16 {
        0
    }
}
