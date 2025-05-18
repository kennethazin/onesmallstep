use log::{debug, error, trace, warn};

use crate::consts::cpu::*;
use crate::decoder::decode;
use crate::instructions::Instructions;
use crate::instructions::{AgcInst, AgcMnem};
use crate::mem::MemoryMap;
use crate::utils::{overflow_correction, s15_add, sign_extend};

#[derive(Debug)]
#[allow(dead_code)]
pub enum AgcUnprogSeq {
    PINC,
    PCDU,
    MINC,
    MCDU,
    DINC,
    SHINC,
    SHANC,
    INOTRD,
    INOTLD,
    FETCH,
    STORE,
    GOJ,
    TCSAJ,
    RUPT,
}

#[derive(Debug)]
#[allow(dead_code)]
pub enum AgcOverflow {
    None,
    Positive,
    Negative,
}

trait AgcUnprogInstr {
    fn handle_goj(&mut self) -> u16;
}

#[allow(dead_code)]
pub struct AgcCpu<'a> {
    mem: MemoryMap<'a>,
    pub ir: u16,
    pub idx_val: u16,
    pub ec_flag: bool,
    pub total_cycles: usize,
    mct_counter: f64,
    timer_counter: u8,

    pub gint: bool,
    pub is_irupt: bool,

    unprog: heapless::Deque<AgcUnprogSeq, 8>,
    pub rupt: u16,

    nightwatch: u16,
    nightwatch_cycles: u32,

    tc_count: u32,
    non_tc_count: u32,

    ruptlock_count: i32,
}

impl<'a> AgcUnprogInstr for AgcCpu<'a> {
    fn handle_goj(&mut self) -> u16 {
        self.write_io(5, 0); // PYJETS
        self.write_io(6, 0); // ROLLJETS
        self.write_io(10, 0); // DSKY
        self.write_io(11, 0); // DSALMOUT
        self.write_io(12, 0); // 12
        self.write_io(13, 0); // 13
        self.write_io(13, 0); // 14
        self.write_io(34, 0); // DOWNWORD1
        self.write_io(34, 0); // DOWNWORD2

        let val = self.read_io(33);
        self.write_io(33, val & 0o75777);
        self.gint = false;
        self.is_irupt = false;
        self.tc_count = 0;
        self.non_tc_count = 0;

        self.restart();

        2
    }
}

impl<'a> AgcCpu<'a> {
    fn calculate_instr_data(&self) -> u16 {
        let mut inst_data = s15_add(self.ir, self.idx_val);
        if self.ec_flag {
            inst_data = inst_data | 0x8000;
        }
        inst_data
    }

    pub fn new(memmap: MemoryMap) -> AgcCpu {
        let mut cpu = AgcCpu {
            mem: memmap,
            ir: 0x0,
            ec_flag: false,
            idx_val: 0x0,
            unprog: heapless::Deque::new(),

            total_cycles: 0,
            mct_counter: 0.0,
            timer_counter: 0,

            gint: false,
            is_irupt: false,
            rupt: 1 << RUPT_DOWNRUPT,

            nightwatch: 0,
            nightwatch_cycles: 0,
            tc_count: 0,
            non_tc_count: 0,
            ruptlock_count: 0,
        };

        cpu.reset();
        cpu
    }

    pub fn reset(&mut self) {
        self.update_pc(0x800);
        self.gint = false;
    }

    fn restart(&mut self) {
        self.update_pc(0x800);
        self.gint = false;
        let io_val = self.read_io(0o163);
        self.write_io(0o163, 0o200 | io_val);
    }

    pub fn update_pc(&mut self, val: u16) {
        self.write(REG_PC, val);
        self.ir = self.read(val as usize);
    }

    pub fn set_unprog_seq(&mut self, unprog_type: AgcUnprogSeq) {
        debug!("Setting UnprogSeq: {:?}", unprog_type);
        match self.unprog.push_back(unprog_type) {
            Err(x) => {
                error!("Unable to push Unprogram Sequence {:?} in AgcCpu Queue", x);
            }
            _ => {}
        }
    }

    pub fn check_editing(&mut self, k: usize) {
        match k {
            0o20 | 0o21 | 0o22 | 0o23 => {
                let val = self.read_s15(k);
                self.write_s15(k, val);
            }
            _ => {}
        }
    }

    pub fn read(&mut self, idx: usize) -> u16 {
        if idx == 0o067 {
            self.nightwatch += 1;
        }
        self.mem.read(idx)
    }
    pub fn read_s16(&mut self, idx: usize) -> u16 {
        match idx {
            REG_A | REG_Q => self.read(idx),

            // Otherwise, sign extend.
            _ => sign_extend(self.read(idx)),
        }
    }
    pub fn read_s15(&mut self, idx: usize) -> u16 {
        match idx {
            REG_A | REG_Q => overflow_correction(self.read(idx)) & 0x7FFF,

            // Otherwise, just read the value
            _ => self.read(idx) & 0x7FFF,
        }
    }
    pub fn write_s16(&mut self, idx: usize, value: u16) {
        match idx {
            REG_A | REG_Q => {
                self.write(idx, value);
            }
            _ => {
                self.write(idx, overflow_correction(value) & 0o77777);
            }
        };
    }
    pub fn write_s15(&mut self, idx: usize, value: u16) {
        match idx {
            REG_A | REG_Q => {
                self.write(idx, sign_extend(value));
            }

            _ => {
                self.write(idx, value & 0o77777);
            }
        };
    }

    pub fn write(&mut self, idx: usize, val: u16) {
        if idx == 0o067 {
            self.nightwatch += 1;
        }
        self.mem.write(idx, val)
    }

    #[allow(dead_code)]
    pub fn read_dp(&mut self, idx: usize) -> u32 {
        let upper: u32 = self.read_s15(idx) as u32;
        let lower: u32 = self.read_s15(idx + 1) as u32;

        match (upper & 0o40000) == (lower & 0o40000) {
            true => (upper << 14) | (lower & 0o37777),
            false => {
                let mut res = if lower & 0o40000 == 0o40000 {
                    let mut val: u32 = upper << 14;
                    val += lower | 0o3777740000;
                    val
                } else {
                    let mut val: u32 = (upper + 1) << 14;
                    val += lower - 1;
                    val
                };

                if res & 0o4000000000 == 0o4000000000 {
                    res += 1;
                }
                res & 0o3777777777
            }
        }
    }
    pub fn write_dp(&mut self, idx: usize, val: u32) {
        let upper = ((val >> 14) & 0o77777) as u16;
        let lower = (val & 0o37777) as u16 | (upper & 0o40000);

        self.write_s15(idx, upper);
        self.write_s15(idx + 1, lower);
    }

    pub fn read_io(&mut self, idx: usize) -> u16 {
        self.mem.read_io(idx)
    }

    pub fn write_io(&mut self, idx: usize, val: u16) {
        self.mem.write_io(idx, val);
    }

    fn is_overflow(&mut self) -> bool {
        let a = self.read(REG_A);
        match a & 0xC000 {
            0xC000 | 0x0000 => false,
            _ => true,
        }
    }

    fn rupt_disabled(&mut self) -> bool {
        if self.ec_flag == true || self.gint == false || self.is_irupt == true || self.is_overflow()
        {
            return true;
        }
        return false;
    }

    fn rupt_pending(&self) -> bool {
        // Check to see if we have any interrupts to handle
        if self.rupt != 0 {
            return true;
        }
        return false;
    }

    fn handle_rupt(&mut self) {
        debug!("Interrupt Mask: {:x}", self.rupt);
        for i in 0..10 {
            let mask = 1 << i;
            if self.rupt & mask != 0 {
                // Set the interrupt flag to pending
                self.gint = false;

                // Store registers to Save State
                let val = self.read(REG_PC) + 1;
                self.write(REG_PC_SHADOW, val);
                self.write(REG_IR, self.calculate_instr_data());
                self.idx_val = 0;

                let new_pc = 0x800 + (i * 4);
                self.update_pc(new_pc);

                // Return
                self.rupt ^= mask;
                break;
            }
        }
    }

    pub fn execute(&mut self, inst: &AgcInst) -> u16 {
        match inst.mnem {
            AgcMnem::TC | AgcMnem::TCF => {
                self.non_tc_count = 0;
                self.tc_count += 1;
            }
            _ => {
                self.tc_count = 0;
                self.non_tc_count += 1;
            }
        }

        let cycles = match inst.mnem {
            AgcMnem::AD => self.ad(&inst),
            AgcMnem::ADS => self.ads(&inst),
            AgcMnem::AUG => self.aug(&inst),
            AgcMnem::BZF => self.bzf(&inst),
            AgcMnem::BZMF => self.bzmf(&inst),
            AgcMnem::CA => self.ca(&inst),
            AgcMnem::CCS => self.ccs(&inst),
            AgcMnem::CS => self.cs(&inst),
            AgcMnem::DAS => self.das(&inst),
            AgcMnem::DCA => self.dca(&inst),
            AgcMnem::DCS => self.dcs(&inst),
            AgcMnem::DIM => self.dim(&inst),
            AgcMnem::DXCH => self.dxch(&inst),
            AgcMnem::DV => self.dv(&inst),
            AgcMnem::EXTEND => {
                self.ec_flag = true;
                self.idx_val = 0x0;
                1
            }
            AgcMnem::INCR => self.incr(&inst),
            AgcMnem::INDEX => {
                let bits = if inst.is_extended() {
                    inst.get_data_bits()
                } else {
                    inst.get_data_bits() & 0o1777
                };
                self.idx_val = self.read(inst.get_data_bits() as usize);
                self.check_editing(bits as usize);
                2
            }
            AgcMnem::INHINT => self.inhint(&inst),
            AgcMnem::LXCH => self.lxch(&inst),
            AgcMnem::MASK => self.mask(&inst),
            AgcMnem::MP => self.mp(&inst),
            AgcMnem::MSU => self.msu(&inst),
            AgcMnem::QXCH => self.qxch(&inst),
            AgcMnem::RELINT => self.relint(&inst),
            AgcMnem::RESUME => self.resume(&inst),
            AgcMnem::ROR => self.ror(&inst),
            AgcMnem::RAND => self.rand(&inst),
            AgcMnem::READ => self.read_instr(&inst),
            AgcMnem::RXOR => self.rxor(&inst),
            AgcMnem::SU => self.su(&inst),
            AgcMnem::TC => self.tc(&inst),
            AgcMnem::TCF => self.tcf(&inst),
            AgcMnem::TS => self.ts(&inst),
            AgcMnem::WAND => self.wand(&inst),
            AgcMnem::WOR => self.wor(&inst),
            AgcMnem::WRITE => self.write_instr(&inst),
            AgcMnem::XCH => self.xch(&inst),
            _ => {
                warn!("Unimplemented Execution of Instruction: {:?}", inst.mnem);
                self.ec_flag = false;
                self.idx_val = 0x0;
                0
            }
        };
        cycles
    }

    fn handle_ruptlock(&mut self, cycles: u16) {
        match self.is_irupt {
            true => {
                if self.ruptlock_count < 0 {
                    self.ruptlock_count = 0;
                }

                self.ruptlock_count += cycles as i32;
                if self.ruptlock_count > RUPT_LOCK_COUNT {
                    debug!("RUPTLOCK Restart. Sending GOJ");
                    self.set_unprog_seq(AgcUnprogSeq::GOJ);
                }
            }
            false => {
                if self.ruptlock_count > 0 {
                    self.ruptlock_count = 0;
                }

                self.ruptlock_count -= cycles as i32;
                if self.ruptlock_count < -RUPT_LOCK_COUNT {
                    debug!("RUPTLOCK Restart. Sending GOJ");
                    self.set_unprog_seq(AgcUnprogSeq::GOJ);
                }
            }
        }
    }

    fn handle_nightwatch(&mut self, cycles: u16) {
        self.nightwatch_cycles += cycles as u32;
        if self.nightwatch_cycles >= NIGHTWATCH_TIME {
            trace!("Checking Nightwatchman {:?}", self.nightwatch);
            self.nightwatch_cycles = 0;
            if self.nightwatch == 0 {
                debug!("NIGHT WATCHMAN Restart. Sending GOJ");
                self.set_unprog_seq(AgcUnprogSeq::GOJ);
            }

            self.nightwatch = 0;
        }
    }

    fn handle_tc_trap(&mut self) {
        if self.tc_count >= TCMONITOR_COUNT {
            self.tc_count = 0;

            self.set_unprog_seq(AgcUnprogSeq::GOJ);
        } else if self.non_tc_count >= TCMONITOR_COUNT {
            self.non_tc_count = 0;

            self.set_unprog_seq(AgcUnprogSeq::GOJ);
        }
    }

    fn update_cycles(&mut self, cycles: u16) {
        self.mct_counter += cycles as f64 * 12.0;

        self.total_cycles += cycles as usize;
        debug!("TotalCyles: {:?}", self.total_cycles * 12);

        self.handle_nightwatch(cycles);
        self.handle_tc_trap();
        self.handle_ruptlock(cycles);

        let timers = self.mem.fetch_timers();
        self.rupt |= timers.pump_mcts(cycles, &mut self.unprog);
    }

    fn step_unprogrammed(&mut self) -> u16 {
        let instr = self.unprog.pop_front().unwrap();
        let cycles = match instr {
            AgcUnprogSeq::GOJ => 2,
            AgcUnprogSeq::TCSAJ => 2,
            AgcUnprogSeq::STORE => 2,
            AgcUnprogSeq::FETCH => 2,
            AgcUnprogSeq::RUPT => 2,
            _ => 1,
        };

        // Update Timers based on instruction MCTs
        self.update_cycles(cycles);

        match instr {
            AgcUnprogSeq::GOJ => {
                self.handle_goj();
                return cycles;
            }
            _ => {}
        };

        if !self.rupt_disabled() {
            self.rupt |= self.mem.check_interrupts();
            if self.rupt_pending() == true {
                debug!("Handling Interrupt: {:?} {:x}", self.gint, self.rupt);
                self.handle_rupt();
                self.is_irupt = true;

                self.set_unprog_seq(AgcUnprogSeq::RUPT);
                let inst_data = self.calculate_instr_data();
                let addr: usize = (self.read(REG_PC) & 0xFFFF) as usize;
                let i = decode(addr as u16, inst_data).unwrap();
                debug!("{:x?}++++", i);
            }
        }

        cycles
    }

    fn step_programmed(&mut self) -> u16 {
        if !self.rupt_disabled() {
            if self.rupt_pending() == true {
                debug!("Handling Interrupt: {:?} {:x}", self.gint, self.rupt);
                self.handle_rupt();
                self.is_irupt = true;

                self.set_unprog_seq(AgcUnprogSeq::RUPT);
                let inst_data = self.calculate_instr_data();

                let addr: usize = (self.read(REG_PC) & 0xFFFF) as usize;
                let i = decode(addr as u16, inst_data).unwrap();
                debug!("{:x?}++++", i);

                return 0;
            }
        }

        let inst_data = self.calculate_instr_data();

        let addr: usize = (self.read(REG_PC) & 0xFFFF) as usize;
        let i = decode(addr as u16, inst_data).unwrap();

        let next_pc = ((addr + 1) & 0xFFFF) as u16;
        self.update_pc(next_pc);
        self.idx_val = 0;

        if self.ec_flag {
            match i.mnem {
                AgcMnem::INDEX => {}
                _ => {
                    self.ec_flag = false;
                }
            }
        }

        let cycles = self.execute(&i);
        self.update_cycles(cycles);
        cycles
    }

    pub fn step(&mut self) -> u16 {
        if self.unprog.len() > 0 {
            self.step_unprogrammed()
        } else {
            // on instruction MCTs
            self.step_programmed()
        }
    }
}
