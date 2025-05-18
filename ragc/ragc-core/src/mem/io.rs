use super::mods::AgcIoPeriph;
use crate::consts::io;
use crate::utils::Option;

use log::{debug, error, warn};

pub struct Io<'a> {
    io_mem: [u16; 256],
    downrupt: Option<&'a mut dyn AgcIoPeriph>,
    dsky: Option<&'a mut dyn AgcIoPeriph>,
}

impl<'a> Io<'a> {
    pub fn new(downrupt: &'a mut dyn AgcIoPeriph, dsky: &'a mut dyn AgcIoPeriph) -> Self {
        let mut s = Self {
            io_mem: [0; 256],
            downrupt: Option::Some(downrupt),
            dsky: Option::Some(dsky),
        };

        s.io_mem[0o30] = 0o37777;
        s.io_mem[0o31] = 0o77777;
        s.io_mem[0o32] = 0o77777;
        s.io_mem[0o33] = 0o77777;
        s
    }

    pub fn blank() -> Self {
        let mut s = Self {
            io_mem: [0; 256],
            downrupt: Option::None,
            dsky: Option::None,
        };
        s.io_mem[0o30] = 0o37777;
        s.io_mem[0o31] = 0o77777;
        s.io_mem[0o32] = 0o77777;
        s.io_mem[0o33] = 0o77777;
        s
    }

    pub fn read(&mut self, channel_idx: usize) -> u16 {
        match channel_idx {
            io::CHANNEL_LOSCALAR | io::CHANNEL_HISCALAR => 0,
            io::CHANNEL_SUPERBNK => self.io_mem[channel_idx] & 0o00160,
            io::CHANNEL_PYJETS | io::CHANNEL_ROLLJETS => self.io_mem[channel_idx],

            io::CHANNEL_DSKY => {
                warn!("DSKY: Reading from DSKY value. which is weird");
                0
            }
            io::CHANNEL_DSALMOUT => self.io_mem[io::CHANNEL_DSALMOUT],
            io::CHANNEL_CHAN12 => self.io_mem[io::CHANNEL_CHAN12],
            io::CHANNEL_CHAN13 => self.io_mem[io::CHANNEL_CHAN13] & 0x47CF,
            io::CHANNEL_CHAN14 => self.io_mem[io::CHANNEL_CHAN14],
            io::CHANNEL_MNKEYIN => match &self.dsky {
                Option::Some(x) => x.read(channel_idx),
                Option::None => 0o00000,
            },
            io::CHANNEL_NAVKEYIN => 0,
            io::CHANNEL_CHAN31 => 0o77777,
            io::CHANNEL_CHAN32 => {
                let val = match &self.dsky {
                    Option::Some(x) => x.read(channel_idx),
                    Option::None => 0o77777,
                };
                //println!("CHAN32: {:5o}", val);
                val | (self.io_mem[0o32] & 0o57777)
            }
            io::CHANNEL_CHAN33 => 0o77777,
            io::CHANNEL_CHAN34 | io::CHANNEL_CHAN35 => match &self.downrupt {
                Option::Some(x) => x.read(channel_idx),
                Option::None => 0o77777,
            },
            0o163 => match &self.dsky {
                Option::Some(x) => x.read(channel_idx),
                Option::None => 0o77777,
            },
            _ => {
                error!("Unknown IO Channel: {:o}", channel_idx);
                self.io_mem[channel_idx]
            }
        }
    }

    pub fn write(&mut self, channel_idx: usize, val: u16) {
        debug!("IO Space Write: {:x} {:x}", channel_idx, val);

        match &mut self.dsky {
            Option::Some(x) => {
                x.write(channel_idx, val);
            }
            _ => {}
        }

        match &mut self.downrupt {
            Option::Some(x) => {
                x.write(channel_idx, val);
            }
            _ => {}
        }

        match channel_idx {
            io::CHANNEL_DSALMOUT => {
                self.io_mem[io::CHANNEL_DSALMOUT] = val; //val & 0x33FF;
            }
            io::CHANNEL_SUPERBNK => self.io_mem[channel_idx] = val & 0o00160,
            io::CHANNEL_CHAN13 => {
                self.io_mem[io::CHANNEL_CHAN13] = val;
            }
            io::CHANNEL_CHAN32 => {}
            _ => {
                self.io_mem[channel_idx] = val;
            }
        }
    }

    pub fn check_interrupt(&mut self) -> u16 {
        let mut val = 0;

        val |= match &mut self.dsky {
            Option::Some(x) => x.is_interrupt(),
            Option::None => 0o00000,
        };

        val |= match &mut self.downrupt {
            Option::Some(x) => x.is_interrupt(),
            Option::None => 0o00000,
        };

        val
    }
}
