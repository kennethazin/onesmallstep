use crate::consts;
use crate::mem::MemoryType;

#[derive(Clone)]
pub struct Memory {
    banks: [[u16; consts::RAM_BANK_NUM_WORDS]; consts::RAM_NUM_BANKS],
}

impl Memory {
    pub fn new() -> Memory {
        Memory {
            banks: [[0; consts::RAM_BANK_NUM_WORDS]; consts::RAM_NUM_BANKS],
        }
    }
    #[allow(dead_code)]
    pub fn reset(&mut self) {
        self.banks = [[0; consts::RAM_BANK_NUM_WORDS]; consts::RAM_NUM_BANKS];
    }
}

impl MemoryType for Memory {
    fn read(&self, bank_idx: usize, bank_offset: usize) -> u16 {
        let res = if bank_idx == 0x0 && bank_offset == consts::cpu::REG_A {
            self.banks[bank_idx][bank_offset]
        } else if bank_idx == 0x0 && bank_offset == consts::cpu::REG_Q {
            self.banks[bank_idx][bank_offset]
        } else {
            self.banks[bank_idx][bank_offset] & 0x7FFF
        };
        res
    }
    fn write(&mut self, bank_idx: usize, bank_offset: usize, value: u16) {
        if bank_idx == 0x0 && bank_offset == consts::cpu::REG_A {
            self.banks[bank_idx][bank_offset] = value;
        } else if bank_idx == 0x0 && bank_offset == consts::cpu::REG_Q {
            self.banks[bank_idx][bank_offset] = value;
        } else {
            let a = value & 0x7FFF;
            self.banks[bank_idx][bank_offset] = a;
        }
    }
}
