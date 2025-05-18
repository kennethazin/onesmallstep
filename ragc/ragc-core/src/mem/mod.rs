mod clocks;
mod edit_registers;
pub mod io;
mod memory;
pub mod mods;
mod registers;
mod rom;
mod special_registers;

pub use io::Io;

use heapless::spsc::Producer;

use log::{error, trace};

use self::mods::AgcIoPeriph;

use crate::consts;
use crate::consts::memmap;

trait MemoryType {
    fn read(&self, bank_idx: usize, bank_offset: usize) -> u16;
    fn write(&mut self, bank_idx: usize, bank_offset: usize, value: u16);
}

pub struct MemoryMap<'a> {
    ram: memory::Memory,
    rom: rom::Rom<'a>,
    io: io::Io<'a>,
    edit: edit_registers::EditRegisters,
    special: special_registers::SpecialRegisters,
    timers: clocks::Timers,
    regs: registers::Registers,
    rom_debug: bool,
    superbank: bool,
}

impl<'a> MemoryMap<'a> {
    pub fn new_blank(rupt_tx: Producer<u8, 8>) -> MemoryMap {
        MemoryMap {
            ram: memory::Memory::new(),
            rom: rom::Rom::blank(),
            io: io::Io::blank(),
            edit: edit_registers::EditRegisters::new(),
            special: special_registers::SpecialRegisters::new(rupt_tx),
            timers: clocks::Timers::new(),
            regs: registers::Registers::new(),
            superbank: false,
            rom_debug: false,
        }
    }

    pub fn new(
        program: &'a [[u16; consts::ROM_BANK_NUM_WORDS]; consts::ROM_NUM_BANKS],
        downrupt: &'a mut dyn AgcIoPeriph,
        dsky: &'a mut dyn AgcIoPeriph,
        rupt_tx: Producer<u8, 8>,
    ) -> MemoryMap<'a> {
        MemoryMap {
            ram: memory::Memory::new(),
            rom: rom::Rom::new(program),
            edit: edit_registers::EditRegisters::new(),
            io: io::Io::new(downrupt, dsky),
            special: special_registers::SpecialRegisters::new(rupt_tx),
            timers: clocks::Timers::new(),
            regs: registers::Registers::new(),
            superbank: false,
            rom_debug: false,
        }
    }

    #[allow(dead_code)]
    pub fn reset(&mut self) {
        self.ram.reset();
        self.timers.reset();
        //self.io.reset();     // TODO: Implement a reset for IO Space
    }

    pub fn enable_rom_write(&mut self) {
        self.rom_debug = true;
    }

    pub fn fetch_timers(&mut self) -> &mut clocks::Timers {
        &mut self.timers
    }

    pub fn write_io(&mut self, idx: usize, value: u16) {
        match idx {
            consts::io::CHANNEL_L => {
                self.regs.write(0, consts::cpu::REG_L, value);
            }
            consts::io::CHANNEL_Q => {
                self.regs.write(0, consts::cpu::REG_Q, value);
            }
            consts::io::CHANNEL_SUPERBNK => {
                if value & 0x40 == 0x40 {
                    self.superbank = true;
                } else {
                    self.superbank = false;
                }
                self.io.write(idx, value);
            }
            consts::io::CHANNEL_CHAN13 => {
                match (value & 0o40000) == 0o40000 {
                    true => {
                        self.timers.set_time6_enable(true);
                    }
                    false => {
                        self.timers.set_time6_enable(false);
                    }
                }
                self.io.write(idx, value & 0o37777);
            }
            consts::io::CHANNEL_CHAN34 => {
                self.timers.set_downrupt_flags(1);
                self.io.write(idx, value);
            }
            consts::io::CHANNEL_CHAN35 => {
                self.timers.set_downrupt_flags(2);
                self.io.write(idx, value);
            }
            _ => {
                self.io.write(idx, value);
            }
        };
    }

    pub fn read_io(&mut self, idx: usize) -> u16 {
        match idx {
            consts::io::CHANNEL_L => self.regs.read(0, consts::cpu::REG_L),
            consts::io::CHANNEL_Q => self.regs.read(0, consts::cpu::REG_Q),
            consts::io::CHANNEL_HISCALAR => {
                let result = self.timers.read_scalar();
                ((result >> 14) & 0o37777) as u16
            }
            consts::io::CHANNEL_LOSCALAR => {
                let result = self.timers.read_scalar();
                (result & 0o37777) as u16
            }
            consts::io::CHANNEL_CHAN13 => {
                let mut res = self.io.read(idx);
                if self.timers.get_time6_enable() {
                    res |= 0o40000;
                }
                res
            }
            _ => self.io.read(idx),
        }
    }

    pub fn write(&mut self, idx: usize, val: u16) {
        trace!("Write: 0x{:x}: 0o{:o}", idx, val);
        match idx {
            0o00..=0o17 => {
                self.regs.write(0, idx, val);
            }
            0o20..=0o23 => {
                self.edit.write(0, idx, val);
            }
            0o24..=0o31 => {
                self.timers.write(0, idx, val);
            }
            0o32..=0o60 => {
                self.special.write(0, idx, val);
            }
            memmap::AGC_MM_ERASABLE_START..=memmap::AGC_MM_ERASABLE_END => {
                if (idx >> 8) == 3 {
                    self.ram.write(self.regs.ebank, (idx & 0xff) as usize, val)
                } else {
                    self.ram.write(idx >> 8, (idx & 0xff) as usize, val)
                }
            }
            memmap::AGC_MM_FIXED_START..=memmap::AGC_MM_FIXED_END => {
                if self.rom_debug == false {
                    error!("Writing to ROM location: {:x}", idx);
                    return;
                }

                let bank_idx = idx >> 10;
                if bank_idx == 1 {
                    self.rom.write(self.regs.fbank, (idx & 0x3ff) as usize, val)
                } else {
                    self.rom.write(bank_idx, (idx & 0x3ff) as usize, val)
                }
            }
            _ => {
                error!("Unimplemented Memory Map Write (Addr: 0x{:x}", idx);
            }
        }
    }

    pub fn read(&self, idx: usize) -> u16 {
        let val = match idx {
            0o00..=0o17 => self.regs.read(0, (idx & 0xff) as usize),
            0o20..=0o23 => self.edit.read(0, idx),
            0o24..=0o31 => self.timers.read(0, idx),
            0o32..=0o60 => self.special.read(0, idx),
            memmap::AGC_MM_ERASABLE_START..=memmap::AGC_MM_ERASABLE_END => {
                if (idx >> 8) == 3 {
                    self.ram.read(self.regs.ebank, (idx & 0xff) as usize)
                } else {
                    self.ram.read(idx >> 8, (idx & 0xff) as usize)
                }
            }
            memmap::AGC_MM_FIXED_START..=memmap::AGC_MM_FIXED_END => {
                if (idx >> 10) == 1 {
                    trace!("Reading from Windowed ROM: {:x} {:x}", self.regs.fbank, idx);
                    match self.regs.fbank {
                        0o30..=0o33 => {
                            if self.superbank == true {
                                self.rom
                                    .read(self.regs.fbank + 0o10, (idx & 0x3ff) as usize)
                            } else {
                                self.rom.read(self.regs.fbank, (idx & 0x3ff) as usize)
                            }
                        }
                        0o34..=0o37 => {
                            if self.superbank == true {
                                error!("Inaccesible Bank with Superbank: {:x}", self.regs.fbank);
                                0
                            } else {
                                self.rom.read(self.regs.fbank, (idx & 0x3ff) as usize)
                            }
                        }
                        _ => self.rom.read(self.regs.fbank, (idx & 0x3ff) as usize),
                    }
                //self.rom.read(self.regs.fbank, (idx & 0x3ff) as usize)
                } else {
                    trace!("Reading from Fixed ROM: {:x}", idx);
                    self.rom.read(idx >> 10, (idx & 0x3ff) as usize)
                }
            }
            _ => {
                error!("Unimplemented Memory Map Read (Addr: 0x{:x}", idx);
                0
            }
        };

        trace!("Read: 0x{:x}: 0o{:o}", idx, val);
        val
    }

    pub fn check_interrupts(&mut self) -> u16 {
        self.io.check_interrupt()
    }
}
