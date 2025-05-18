use crate::consts;
use crate::mem::MemoryType;
use log::debug;

#[derive(Clone)]
pub struct Registers {
    regs: [u16; 32],
    pub fbank: usize,
    pub ebank: usize,
}

impl Registers {
    pub fn new() -> Registers {
        Registers {
            regs: [0; 32],
            fbank: 0,
            ebank: 0,
        }
    }

    #[allow(dead_code)]
    pub fn reset(&mut self) {
        self.regs = [0; 32];
        self.fbank = 0;
        self.ebank = 0;
    }

    fn update_bank_registers(&mut self) {
        let evalue: u16 = ((self.ebank & 0x7) << 8) as u16;
        let fvalue: u16 = ((self.fbank & 0x1F) << 10) as u16;
        let bvalue: u16 = (evalue >> 8) | fvalue;
        self.regs[consts::cpu::REG_EB] = evalue;
        self.regs[consts::cpu::REG_FB] = fvalue;
        self.regs[consts::cpu::REG_BB] = bvalue;
        debug!(
            "Updating Bank Registers: {:x} | {:x} | {:x}",
            evalue, fvalue, bvalue
        );
    }
}

impl MemoryType for Registers {
    fn read(&self, _bank_idx: usize, bank_offset: usize) -> u16 {
        match bank_offset {
            consts::cpu::REG_A | consts::cpu::REG_Q => self.regs[bank_offset],
            consts::cpu::REG_Z => self.regs[bank_offset] & 0o7777,
            consts::cpu::REG_ZERO => 0o00000,
            _ => self.regs[bank_offset] & 0o77777,
        }
    }

    fn write(&mut self, _bank_idx: usize, bank_offset: usize, value: u16) {
        match bank_offset {
            consts::cpu::REG_BB => {
                self.ebank = (value & 0x7) as usize;
                self.fbank = ((value & 0x7C00) >> 10) as usize;
                self.update_bank_registers();
                return;
            }

            consts::cpu::REG_FB => {
                self.fbank = ((value & 0x7C00) >> 10) as usize;
                self.update_bank_registers();
                return;
            }

            consts::cpu::REG_EB => {
                self.ebank = ((value & 0x0700) >> 8) as usize;
                self.update_bank_registers();
                return;
            }

            consts::cpu::REG_Z => {
                self.regs[bank_offset] = value & 0o7777;
            }

            consts::cpu::REG_ZERO => {
                return;
            }

            _ => {
                self.regs[bank_offset] = value & 0o77777;
            }
        }
        self.regs[bank_offset] = value;
    }
}
